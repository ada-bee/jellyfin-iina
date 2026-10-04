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
import { normalizeServerUrl, resolveDeliveryUrl } from "../jellyfin/url";

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
    audioStreamIndex?: number | null;
    subtitleStreamIndex?: number | null;
}

export interface PlaybackStreamSelection {
    mediaSourceId?: string;
    audioStreamIndex?: number | null;
    subtitleStreamIndex?: number | null;
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
        playSessionId: options.playSessionId || ""
    };

    const queryString = buildQueryString(params);
    return resolveDeliveryUrl(baseUrl, `/Videos/${encodeURIComponent(options.itemId)}/stream?${queryString}`);
}

export function buildPlaybackInfoRequest(
    userId: string,
    deviceProfile: JellyfinDeviceProfile,
    selection: PlaybackStreamSelection = {}
): JellyfinPlaybackInfoDto {
    return {
        UserId: userId,
        MediaSourceId: selection.mediaSourceId,
        AudioStreamIndex: selection.audioStreamIndex,
        SubtitleStreamIndex: selection.subtitleStreamIndex === null ? -1 : selection.subtitleStreamIndex,
        DeviceProfile: deviceProfile,
        EnableDirectPlay: true,
        EnableDirectStream: false,
        EnableTranscoding: false,
        AllowVideoStreamCopy: true,
        AllowAudioStreamCopy: true
    };
}

export function selectPlayableMediaSource(
    playbackInfo: JellyfinPlaybackInfoResponse,
    mediaSourceId?: string
): JellyfinMediaSourceInfo {
    const sources = playbackInfo.MediaSources || [];
    const mediaSource = mediaSourceId
        ? sources.find(source => source.Id === mediaSourceId)
        : sources.find(isPlayableMediaSource);
    if (mediaSource && isPlayableMediaSource(mediaSource)) {
        return mediaSource;
    }
    if (mediaSourceId && !mediaSource) {
        throw new Error("Jellyfin did not provide the selected media source.");
    }

    const errorCode = playbackInfo.ErrorCode ? ` (${playbackInfo.ErrorCode})` : "";
    throw new Error(`Jellyfin cannot direct play this item${errorCode}. `
        + "Check the user's playback permissions and the server's bitrate limit, or choose another version. "
        + "Transcoding will be supported in 3.1.0.");
}

function isPlayableMediaSource(source: JellyfinMediaSourceInfo): boolean {
    return Boolean(source.Id) && source.SupportsDirectPlay === true;
}

export function buildPlaybackHandoff(
    playbackInfo: JellyfinPlaybackInfoResponse,
    options: PlaybackHandoffOptions
): PlaybackHandoff {
    const playSessionId = playbackInfo.PlaySessionId || "";
    if (!playSessionId) {
        throw new Error("Jellyfin did not provide a playback session.");
    }

    const mediaSource = selectPlayableMediaSource(playbackInfo, options.mediaSourceId);
    const mediaSourceId = mediaSource.Id || "";
    const url = buildJellyfinStreamUrl({ ...options, mediaSourceId, playSessionId });
    if (!url) {
        throw new Error("Jellyfin returned incomplete playback information.");
    }
    const audioStreamIndex = options.audioStreamIndex === undefined
        ? mediaSource.DefaultAudioStreamIndex
        : options.audioStreamIndex;
    const subtitleStreamIndex = normalizeSubtitleStreamIndex(options.subtitleStreamIndex === undefined
        ? mediaSource.DefaultSubtitleStreamIndex
        : options.subtitleStreamIndex);

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
        playMethod: "DirectPlay",
        audioStreamIndex,
        subtitleStreamIndex,
        externalSubtitles: buildExternalSubtitleTracks(
            mediaSource,
            options.serverUrl,
            options.itemId,
            subtitleStreamIndex
        ),
        seriesId: options.seriesId,
        seasonId: options.seasonId,
        episodeIndex: options.episodeIndex
    };
}

function normalizeSubtitleStreamIndex(index: number | null | undefined): number | null | undefined {
    return index === -1 ? null : index;
}

export function buildExternalSubtitleTracks(
    mediaSource: JellyfinMediaSourceInfo,
    serverUrl: string,
    itemId: string,
    selectedStreamIndex: number | null | undefined = mediaSource.DefaultSubtitleStreamIndex
): ExternalSubtitleTrack[] {
    return (mediaSource.MediaStreams || [])
        .filter(isExternalSubtitleStream)
        .map(stream => buildExternalSubtitleTrack(
            stream,
            selectedStreamIndex,
            serverUrl,
            itemId,
            mediaSource.Id || ""
        ))
        .filter((track): track is ExternalSubtitleTrack => track !== null);
}

function isExternalSubtitleStream(stream: JellyfinMediaStream): boolean {
    return stream.Type === "Subtitle"
        && (stream.IsExternal === true || stream.DeliveryMethod === "External")
        && typeof stream.Index === "number"
        && stream.Index >= 0;
}

function buildExternalSubtitleTrack(
    stream: JellyfinMediaStream,
    defaultSubtitleStreamIndex: number | null | undefined,
    serverUrl: string,
    itemId: string,
    mediaSourceId: string
): ExternalSubtitleTrack | null {
    const index = stream.Index;
    const deliveryUrl = stream.DeliveryUrl || buildSubtitleDeliveryPath(stream, itemId, mediaSourceId);
    if (index === undefined || !deliveryUrl) {
        return null;
    }

    const url = resolveDeliveryUrl(serverUrl, deliveryUrl);
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

function buildSubtitleDeliveryPath(
    stream: JellyfinMediaStream,
    itemId: string,
    mediaSourceId: string
): string {
    if (!itemId || !mediaSourceId) {
        return "";
    }
    const format = getSubtitleFormat(stream);
    if (!format) {
        return "";
    }
    return `/Videos/${encodeURIComponent(itemId)}/${encodeURIComponent(mediaSourceId)}`
        + `/Subtitles/${stream.Index}/Stream.${format}`;
}

function getSubtitleFormat(stream: JellyfinMediaStream): string {
    if (/\.mks$/i.test(stream.Path || "")) {
        return "mks";
    }
    const codec = (stream.Codec || "").toLowerCase();
    const formats: Record<string, string> = {
        ass: "ass", ssa: "ssa", srt: "srt", subrip: "srt", vtt: "vtt", webvtt: "vtt",
        pgssub: "pgssub", hdmv_pgs_subtitle: "pgssub", sup: "pgssub"
    };
    if (formats[codec]) {
        return formats[codec];
    }
    if (stream.IsTextSubtitleStream === false) {
        return "";
    }
    return "srt";
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
