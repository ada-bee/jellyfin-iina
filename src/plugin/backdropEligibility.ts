export interface BackdropEligibilityState {
    playbackPaused: boolean;
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

export function isBackdropPlaybackPaused(playbackPaused: boolean, mediaPath: string): boolean {
    return playbackPaused || mediaPath.endsWith("/Jellyfin.png");
}

export function shouldShowBackdrop(state: BackdropEligibilityState): boolean {
    return state.playbackPaused && state.jellyfinSidebarOpen && state.previewsEnabled;
}
