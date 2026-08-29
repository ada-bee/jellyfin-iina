import type { PlaybackHandoff } from "./jellyfin";

export const MESSAGE_NAMES = {
    AuthUpdated: "authUpdated",
    AuthCleared: "authCleared",
    PlayItem: "playItem",
    PreviewBackdrops: "previewBackdrops",
    RefreshSidebar: "refreshSidebar",
    SidebarPreferences: "sidebarPreferences",
    OverlayBackdrops: "overlayBackdrops",
    OverlaySkipButton: "overlaySkipButton",
    SkipSegment: "skipSegment"
} as const;

export type MessageName = typeof MESSAGE_NAMES[keyof typeof MESSAGE_NAMES];

export type EmptyPayload = Record<string, never>;

export interface AuthUpdatedPayload {
    serverUrl: string;
    accessToken: string;
    userId: string;
    username: string;
    deviceId: string;
    serverName: string;
}

export type AuthClearedPayload = EmptyPayload;

export interface PlayItemPayload {
    playback: PlaybackHandoff;
    resumeSeconds?: number;
    title?: string;
}

export interface PreviewBackdropsPayload {
    itemId: string;
    backdropTags: string[];
}

export type RefreshSidebarPayload = EmptyPayload;

export interface SidebarPreferencesPayload {
    backdropPreviewsEnabled: boolean;
    preferEpisodeImagesInNextUp: boolean;
}

export interface OverlayBackdropsPayload {
    urls: string[];
}

export interface OverlaySkipButtonPayload {
    label: string;
}

export type SkipSegmentPayload = EmptyPayload;

export interface UiToPluginMessagePayloads {
    authUpdated: AuthUpdatedPayload;
    authCleared: AuthClearedPayload;
    playItem: PlayItemPayload;
    previewBackdrops: PreviewBackdropsPayload;
    skipSegment: SkipSegmentPayload;
}

export interface PluginToUiMessagePayloads {
    refreshSidebar: RefreshSidebarPayload;
    sidebarPreferences: SidebarPreferencesPayload;
    overlayBackdrops: OverlayBackdropsPayload;
    overlaySkipButton: OverlaySkipButtonPayload;
}

export type MessagePayloads = UiToPluginMessagePayloads & PluginToUiMessagePayloads;

export type UiToPluginMessageName = keyof UiToPluginMessagePayloads;
export type PluginToUiMessageName = keyof PluginToUiMessagePayloads;

export type MessagePayload<Name extends MessageName> = MessagePayloads[Name];
