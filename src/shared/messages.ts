import type { PlaybackHandoff } from "./jellyfin";

export const MESSAGE_NAMES = {
    AuthUpdated: "authUpdated",
    AuthCleared: "authCleared",
    PlayItem: "playItem",
    RefreshSidebar: "refreshSidebar",
    SidebarPreferences: "sidebarPreferences"
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

export type RefreshSidebarPayload = EmptyPayload;

export interface SidebarPreferencesPayload {
    preferEpisodeImagesInNextUp: boolean;
}

export interface UiToPluginMessagePayloads {
    authUpdated: AuthUpdatedPayload;
    authCleared: AuthClearedPayload;
    playItem: PlayItemPayload;
}

export interface PluginToUiMessagePayloads {
    refreshSidebar: RefreshSidebarPayload;
    sidebarPreferences: SidebarPreferencesPayload;
}

export type MessagePayloads = UiToPluginMessagePayloads & PluginToUiMessagePayloads;

export type UiToPluginMessageName = keyof UiToPluginMessagePayloads;
export type PluginToUiMessageName = keyof PluginToUiMessagePayloads;

export type MessagePayload<Name extends MessageName> = MessagePayloads[Name];
