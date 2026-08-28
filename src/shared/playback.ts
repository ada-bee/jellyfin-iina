import type {
    JellyfinBaseItem,
    JellyfinDeviceProfile,
    JellyfinMediaSourceInfo,
    JellyfinPlaybackInfoDto,
    JellyfinPlaybackInfoResponse,
    PlaybackHandoff
} from "./jellyfin";
import { normalizeServerUrl } from "./url";

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
    return `${baseUrl}/Videos/${options.itemId}/stream?${queryString}`;
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
        EnableTranscoding: false,
        AllowVideoStreamCopy: true,
        AllowAudioStreamCopy: true
    };
}

export function selectDirectPlaySource(
    playbackInfo: JellyfinPlaybackInfoResponse
): JellyfinMediaSourceInfo {
    const mediaSource = playbackInfo.MediaSources?.find(source => (
        Boolean(source.Id) && source.SupportsDirectPlay === true
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

    const mediaSource = selectDirectPlaySource(playbackInfo);
    const mediaSourceId = mediaSource.Id || "";
    const url = buildJellyfinStreamUrl({
        ...options,
        mediaSourceId,
        playSessionId
    });
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
        playMethod: "DirectPlay",
        audioStreamIndex: mediaSource.DefaultAudioStreamIndex,
        subtitleStreamIndex: mediaSource.DefaultSubtitleStreamIndex,
        seriesId: options.seriesId,
        seasonId: options.seasonId,
        episodeIndex: options.episodeIndex
    };
}

export function buildJellyfinWindowTitle(item: JellyfinBaseItem | null, fallbackName: string): string {
    if (!item) {
        return fallbackName || "";
    }

    const name = item.Name || fallbackName || "";
    const type = item.Type;

    if (type === "Episode") {
        const seriesName = item.SeriesName || "";
        const seasonNumber = item.ParentIndexNumber;
        const episodeNumber = item.IndexNumber;
        const seasonLabel = seasonNumber !== null && seasonNumber !== undefined
            ? String(seasonNumber).padStart(2, "0")
            : "00";
        const episodeLabel = episodeNumber !== null && episodeNumber !== undefined
            ? String(episodeNumber).padStart(2, "0")
            : "00";
        const titleParts = [seriesName, `S${seasonLabel}E${episodeLabel}`];
        if (name) {
            titleParts.push(name);
        }
        return titleParts.filter(Boolean).join(EPISODE_TITLE_SEPARATOR);
    }

    if (type === "Movie") {
        const year = item.ProductionYear ? ` (${item.ProductionYear})` : "";
        return `${name}${year}`;
    }

    return name;
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
