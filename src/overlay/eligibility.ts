export type BackdropMode = "hidden" | "browse" | "paused";

export interface BackdropModeState {
    playbackPaused: boolean;
    jellyfinPlaybackActive: boolean;
    mediaPath: string;
    libraryHostUrl: string;
    jellyfinSidebarOpen: boolean;
    previewsEnabled: boolean;
}

const JELLYFIN_SIDEBAR_NAME = "plugin:xyz.brbc.jellyfin";

export function isJellyfinSidebarOpen(
    reportedSidebar: string | null | undefined,
    trackedOpen: boolean
): boolean {
    if (reportedSidebar === null || reportedSidebar === undefined) {
        return trackedOpen;
    }
    return reportedSidebar === JELLYFIN_SIDEBAR_NAME;
}

export function isJellyfinLibraryHost(
    mediaPath: string,
    libraryHostUrl: string
): boolean {
    const actualPath = normalizeFilePath(mediaPath);
    const expectedPath = normalizeFilePath(libraryHostUrl);
    if (!actualPath || !expectedPath) {
        return false;
    }
    return actualPath === expectedPath;
}

export function resolveBackdropMode(state: BackdropModeState): BackdropMode {
    if (!state.jellyfinSidebarOpen || !state.previewsEnabled) {
        return "hidden";
    }
    if (isJellyfinLibraryHost(state.mediaPath, state.libraryHostUrl)) {
        return "browse";
    }
    if (state.jellyfinPlaybackActive && state.playbackPaused) {
        return "paused";
    }
    return "hidden";
}

function normalizeFilePath(path: string): string {
    const withoutScheme = path.trim().replace(/^file:\/\//, "");
    try {
        return decodeURIComponent(withoutScheme);
    } catch {
        return withoutScheme;
    }
}
