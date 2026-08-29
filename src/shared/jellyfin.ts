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
    MediaStream,
    PlaybackInfoDto,
    PlaybackInfoResponse,
    PlaybackProgressInfo,
    PlaybackStartInfo,
    PlaybackStopInfo,
    PlayMethod,
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
export type JellyfinMediaStream = MediaStream;
export type JellyfinPlaybackInfoDto = PlaybackInfoDto;
export type JellyfinPlaybackInfoResponse = PlaybackInfoResponse;
export type JellyfinPlaybackProgressInfo = PlaybackProgressInfo;
export type JellyfinPlaybackStartInfo = PlaybackStartInfo;
export type JellyfinPlaybackStopInfo = PlaybackStopInfo;
export type JellyfinPlayMethod = PlayMethod;
export type JellyfinPublicSystemInfo = PublicSystemInfo;
export type JellyfinUserItemData = UserItemDataDto;

export type MediaSegmentType = "Intro" | "Outro";

export interface MediaSegment {
    type: MediaSegmentType;
    startTicks: number | null;
    endTicks: number | null;
}

export interface ExternalSubtitleTrack {
    index: number;
    url: string;
    title: string;
    language: string;
    isDefault: boolean;
    isForced: boolean;
    isHearingImpaired: boolean;
}

export interface PlaybackContext {
    itemId: string;
    mediaSourceId: string;
    playSessionId: string;
    accessToken: string;
    deviceId: string;
    serverUrl: string;
    runtimeTicks: number;
    playMethod: JellyfinPlayMethod;
    audioStreamIndex?: number | null;
    subtitleStreamIndex?: number | null;
    externalSubtitles: ExternalSubtitleTrack[];
    seriesId?: string;
    seasonId?: string;
    episodeIndex?: number | null;
    userId?: string;
}

export interface PlaybackHandoff extends PlaybackContext {
    url: string;
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
