import type {
    ExternalSubtitleTrack,
    JellyfinBaseItem,
    JellyfinDeviceProfile,
    JellyfinMediaSourceInfo,
    JellyfinMediaStream,
    JellyfinPlaybackInfoDto,
    JellyfinPlaybackInfoResponse,
    PlaybackHandoff
} from "../jellyfin/types";
import { normalizeServerUrl } from "../jellyfin/url";

export interface StreamUrlOptions {
    serverUrl: string;
    accessToken: string;
    deviceId: string;
    userId: string;
    itemId: string;
    mediaSourceId?: string;
    playSessionId?: string;
}

export interface PlaybackHandoffOptions extends StreamUrlOptions {
    runtimeTicks?: number | null;
    seriesId?: string;
    seasonId?: string;
    episodeIndex?: number | null;
}

const EPISODE_TITLE_SEPARATOR = " \u2022 ";

export function buildJellyfinStreamUrl(options: StreamUrlOptions): string {
    if (!options.serverUrl || !options.itemId) {
        return "";
    }

    const baseUrl = normalizeServerUrl(options.serverUrl);
    const mediaSourceId = options.mediaSourceId || options.itemId;

    const params: Record<string, string | number | boolean> = {
        Static: "true",
        mediaSourceId: mediaSourceId,
        playSessionId: options.playSessionId || "",
        api_key: options.accessToken
    };

    const queryString = buildQueryString(params);
    return `${baseUrl}/Videos/${encodeURIComponent(options.itemId)}/stream?${queryString}`;
}

export function buildPlaybackInfoRequest(
    userId: string,
    deviceProfile: JellyfinDeviceProfile
): JellyfinPlaybackInfoDto {
    return {
        UserId: userId,
        DeviceProfile: deviceProfile,
        EnableDirectPlay: true,
        EnableDirectStream: true,
        EnableTranscoding: true,
        AllowVideoStreamCopy: true,
        AllowAudioStreamCopy: true
    };
}

export function selectPlayableMediaSource(
    playbackInfo: JellyfinPlaybackInfoResponse
): JellyfinMediaSourceInfo {
    const mediaSource = playbackInfo.MediaSources?.find(source => (
        Boolean(source.Id)
        && (source.SupportsDirectPlay === true || Boolean(source.TranscodingUrl))
    ));
    if (mediaSource) {
        return mediaSource;
    }

    const errorCode = playbackInfo.ErrorCode ? ` (${playbackInfo.ErrorCode})` : "";
    throw new Error(`Jellyfin did not provide a playable media source${errorCode}.`);
}

export function buildPlaybackHandoff(
    playbackInfo: JellyfinPlaybackInfoResponse,
    options: PlaybackHandoffOptions
): PlaybackHandoff {
    const playSessionId = playbackInfo.PlaySessionId || "";
    if (!playSessionId) {
        throw new Error("Jellyfin did not provide a playback session.");
    }

    const mediaSource = selectPlayableMediaSource(playbackInfo);
    const mediaSourceId = mediaSource.Id || "";
    const directPlay = mediaSource.SupportsDirectPlay === true;
    const url = directPlay
        ? buildJellyfinStreamUrl({ ...options, mediaSourceId, playSessionId })
        : buildAuthenticatedDeliveryUrl(
            options.serverUrl,
            mediaSource.TranscodingUrl || "",
            options.accessToken
        );
    if (!url) {
        throw new Error("Jellyfin returned incomplete playback information.");
    }

    return {
        url,
        serverUrl: normalizeServerUrl(options.serverUrl),
        accessToken: options.accessToken,
        deviceId: options.deviceId,
        userId: options.userId,
        itemId: options.itemId,
        mediaSourceId,
        playSessionId,
        runtimeTicks: mediaSource.RunTimeTicks || options.runtimeTicks || 0,
        playMethod: directPlay ? "DirectPlay" : resolveTranscodingPlayMethod(mediaSource),
        audioStreamIndex: mediaSource.DefaultAudioStreamIndex,
        subtitleStreamIndex: mediaSource.DefaultSubtitleStreamIndex,
        externalSubtitles: buildExternalSubtitleTracks(
            mediaSource,
            options.serverUrl,
            options.accessToken
        ),
        seriesId: options.seriesId,
        seasonId: options.seasonId,
        episodeIndex: options.episodeIndex
    };
}

export function resolveTranscodingPlayMethod(
    mediaSource: JellyfinMediaSourceInfo
): "DirectStream" | "Transcode" {
    const transcodingUrl = mediaSource.TranscodingUrl || "";
    const videoCodec = getQueryParameter(transcodingUrl, "VideoCodec").toLowerCase();
    if (videoCodec === "copy") {
        return "DirectStream";
    }

    const hasVideo = (mediaSource.MediaStreams || []).some(stream => stream.Type === "Video");
    const audioCodec = getQueryParameter(transcodingUrl, "AudioCodec").toLowerCase();
    if (!hasVideo && audioCodec === "copy") {
        return "DirectStream";
    }
    return "Transcode";
}

export function buildExternalSubtitleTracks(
    mediaSource: JellyfinMediaSourceInfo,
    serverUrl: string,
    accessToken: string
): ExternalSubtitleTrack[] {
    return (mediaSource.MediaStreams || [])
        .filter(isExternalSubtitleStream)
        .map(stream => buildExternalSubtitleTrack(
            stream,
            mediaSource.DefaultSubtitleStreamIndex,
            serverUrl,
            accessToken
        ))
        .filter((track): track is ExternalSubtitleTrack => track !== null);
}

function isExternalSubtitleStream(stream: JellyfinMediaStream): boolean {
    return stream.Type === "Subtitle"
        && stream.DeliveryMethod === "External"
        && typeof stream.Index === "number"
        && Boolean(stream.DeliveryUrl);
}

function buildExternalSubtitleTrack(
    stream: JellyfinMediaStream,
    defaultSubtitleStreamIndex: number | null | undefined,
    serverUrl: string,
    accessToken: string
): ExternalSubtitleTrack | null {
    const index = stream.Index;
    const deliveryUrl = stream.DeliveryUrl || "";
    if (index === undefined || !deliveryUrl) {
        return null;
    }

    const url = buildAuthenticatedDeliveryUrl(serverUrl, deliveryUrl, accessToken);
    if (!url) {
        return null;
    }

    return {
        index,
        url,
        title: stream.DisplayTitle || stream.Title || stream.Language || `Subtitle ${index}`,
        language: stream.Language || "",
        isDefault: defaultSubtitleStreamIndex === index,
        isForced: Boolean(stream.IsForced),
        isHearingImpaired: Boolean(stream.IsHearingImpaired)
    };
}

export function buildAuthenticatedDeliveryUrl(
    serverUrl: string,
    deliveryUrl: string,
    accessToken: string
): string {
    const baseUrl = normalizeServerUrl(serverUrl);
    const trimmedDeliveryUrl = deliveryUrl.trim();
    if (!baseUrl || !trimmedDeliveryUrl) {
        return "";
    }

    const isAbsolute = /^https?:\/\//i.test(trimmedDeliveryUrl);
    const resolvedUrl = isAbsolute
        ? trimmedDeliveryUrl
        : `${baseUrl}/${trimmedDeliveryUrl.replace(/^\/+/, "")}`;
    if (!/^https:\/\//i.test(resolvedUrl)) {
        return "";
    }

    const serverOrigin = getHttpOrigin(baseUrl);
    const deliveryOrigin = getHttpOrigin(resolvedUrl);
    if (!accessToken || !serverOrigin || serverOrigin !== deliveryOrigin || hasAccessToken(resolvedUrl)) {
        return resolvedUrl;
    }

    return appendQueryParameter(resolvedUrl, "api_key", accessToken);
}

function getHttpOrigin(url: string): string {
    const match = url.match(/^https?:\/\/[^/?#]+/i);
    return match ? match[0].toLowerCase() : "";
}

function hasAccessToken(url: string): boolean {
    return /[?&](?:api_key|access_token|x-emby-token)=/i.test(url);
}

function getQueryParameter(url: string, requestedKey: string): string {
    const queryStart = url.indexOf("?");
    if (queryStart === -1) {
        return "";
    }

    const queryEnd = url.indexOf("#", queryStart);
    const query = url.substring(queryStart + 1, queryEnd === -1 ? url.length : queryEnd);
    for (const pair of query.split("&")) {
        const separator = pair.indexOf("=");
        const rawKey = separator === -1 ? pair : pair.substring(0, separator);
        if (decodeQueryValue(rawKey).toLowerCase() !== requestedKey.toLowerCase()) {
            continue;
        }
        return decodeQueryValue(separator === -1 ? "" : pair.substring(separator + 1));
    }
    return "";
}

function decodeQueryValue(value: string): string {
    try {
        return decodeURIComponent(value.replace(/\+/g, " "));
    } catch (error) {
        return value;
    }
}

function appendQueryParameter(url: string, key: string, value: string): string {
    const fragmentIndex = url.indexOf("#");
    const fragment = fragmentIndex === -1 ? "" : url.substring(fragmentIndex);
    const urlWithoutFragment = fragmentIndex === -1 ? url : url.substring(0, fragmentIndex);
    const separator = urlWithoutFragment.includes("?") ? "&" : "?";
    return `${urlWithoutFragment}${separator}${encodeURIComponent(key)}=${encodeURIComponent(value)}${fragment}`;
}

export function buildJellyfinWindowTitle(item: JellyfinBaseItem | null, fallbackName: string): string {
    if (!item) {
        return fallbackName || "";
    }

    const name = item.Name || fallbackName || "";
    if (item.Type === "Episode") {
        return buildEpisodeWindowTitle(item, name);
    }
    if (item.Type === "Movie") {
        return buildMovieWindowTitle(item, name);
    }
    return name;
}

function buildEpisodeWindowTitle(item: JellyfinBaseItem, name: string): string {
    const episodeCode = `S${formatTitleIndex(item.ParentIndexNumber)}E${formatTitleIndex(item.IndexNumber)}`;
    return [item.SeriesName || "", episodeCode, name]
        .filter(Boolean)
        .join(EPISODE_TITLE_SEPARATOR);
}

function buildMovieWindowTitle(item: JellyfinBaseItem, name: string): string {
    const year = item.ProductionYear ? ` (${item.ProductionYear})` : "";
    return `${name}${year}`;
}

function formatTitleIndex(index: number | null | undefined): string {
    return index === null || index === undefined ? "00" : String(index).padStart(2, "0");
}


function buildQueryString(params: Record<string, string | number | boolean>): string {
    const parts: string[] = [];
    Object.keys(params).forEach((key) => {
        const value = params[key];
        if (value === undefined || value === null) {
            return;
        }
        parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
    });
    return parts.join("&");
}
