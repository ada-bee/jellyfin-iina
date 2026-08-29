export interface SidebarLaunchState {
    windowReady: boolean;
    windowClosed: boolean;
    windowLoaded: boolean;
    mediaPath: string;
}

export function shouldOpenJellyfinSplash(state: SidebarLaunchState): boolean {
    return !state.windowReady
        && (state.windowClosed || (!state.windowLoaded && !state.mediaPath));
}
