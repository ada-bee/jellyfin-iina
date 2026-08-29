import type {
    AuthenticationResult,
    BaseItemDto,
    BaseItemDtoQueryResult,
    BaseItemKind,
    DeviceProfile,
    ImageInfo,
    MediaSegmentDto,
    MediaSegmentDtoQueryResult,
    MediaSourceInfo,
    PlaybackInfoResponse,
    PlaybackProgressInfo,
    PlaybackStartInfo,
    PlaybackStopInfo,
    PublicSystemInfo,
    UserItemDataDto
} from "@jellyfin/sdk/lib/generated-client/models";

export type JellyfinAuthenticationResult = AuthenticationResult;
export type JellyfinBaseItem = BaseItemDto;
export type JellyfinBaseItemKind = BaseItemKind;
export type JellyfinBaseItemQuery = BaseItemDtoQueryResult;
export type JellyfinDeviceProfile = DeviceProfile;
export type JellyfinImageInfo = ImageInfo;
export type JellyfinMediaSegment = MediaSegmentDto;
export type JellyfinMediaSegmentQuery = MediaSegmentDtoQueryResult;
export type JellyfinMediaSourceInfo = MediaSourceInfo;
export type JellyfinPlaybackInfoResponse = PlaybackInfoResponse;
export type JellyfinPlaybackProgressInfo = PlaybackProgressInfo;
export type JellyfinPlaybackStartInfo = PlaybackStartInfo;
export type JellyfinPlaybackStopInfo = PlaybackStopInfo;
export type JellyfinPublicSystemInfo = PublicSystemInfo;
export type JellyfinUserItemData = UserItemDataDto;

export type MediaSegmentType = "Intro" | "Outro";

export interface MediaSegment {
    type: MediaSegmentType;
    startTicks: number | null;
    endTicks: number | null;
}

export interface PlaybackContext {
    itemId: string;
    mediaSourceId: string;
    playSessionId: string;
    accessToken: string;
    deviceId: string;
    serverUrl: string;
    runtimeTicks: number;
    seriesId?: string;
    seasonId?: string;
    episodeIndex?: number | null;
    userId?: string;
}

export interface AutoplayRequest {
    requestId: number;
    itemId: string;
    seriesId?: string;
    seasonId?: string;
    episodeIndex?: number | null;
}

export interface AutoplayResolution {
    requestId: number;
    itemId?: string;
    url?: string;
    title?: string;
    error?: string;
}
