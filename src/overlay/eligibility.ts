export type BackdropMode = "hidden" | "browse" | "paused";

export interface BackdropModeState {
    playbackPaused: boolean;
    jellyfinPlaybackActive: boolean;
    mediaPath: string;
    splashPaths: readonly string[];
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

export function isJellyfinSplashPath(mediaPath: string, splashPaths: readonly string[]): boolean {
    const actualPath = normalizeFilePath(mediaPath);
    if (!actualPath) {
        return false;
    }
    return splashPaths.some(path => matchesExpectedPath(actualPath, normalizeFilePath(path)));
}

function matchesExpectedPath(actualPath: string, expectedPath: string): boolean {
    if (!expectedPath) {
        return false;
    }
    if (!expectedPath.startsWith("~/")) {
        return actualPath === expectedPath;
    }
    return actualPath === expectedPath || actualPath.endsWith(expectedPath.slice(1));
}

export function resolveBackdropMode(state: BackdropModeState): BackdropMode {
    if (!state.jellyfinSidebarOpen || !state.previewsEnabled) {
        return "hidden";
    }
    if (isJellyfinSplashPath(state.mediaPath, state.splashPaths)) {
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
