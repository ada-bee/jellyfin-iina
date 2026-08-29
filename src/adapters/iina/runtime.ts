import type {
    AuthUpdatedPayload,
    BackdropContextPayload,
    PlayItemPayload,
    SidebarVisibilityChangedPayload
} from "../../jellyfin/messages";

import { MESSAGE_NAMES } from "../../jellyfin/messages";
import {
    isJellyfinSplashPath,
    isJellyfinSidebarOpen,
    resolveBackdropMode
} from "../../overlay/eligibility";
import {
    BACKDROP_PREVIEWS_PREF_KEY,
    JELLYFIN_DEV_PLUGIN_ROOT,
    JELLYFIN_SPLASH_URLS,
    PREFER_EPISODE_IMAGES_IN_NEXT_UP_PREF_KEY,
    resolveJellyfinSplashUrl,
    SHOW_SIDEBAR_DELAY_MS
} from "./constants";
import { initializePlaybackHandlers } from "./playbackRuntime";
import {
    clearBackdropContext,
    initializeMediaOverlay,
    loadMediaOverlay,
    refreshMediaOverlay,
    setBackdropContext,
    setBackdropPresentation,
    setSidebarWidth
} from "./mediaOverlay";
import { clearAuthState, updateAuthState } from "../../jellyfin/session";
import { shouldOpenJellyfinSplash } from "../../sidebar/launch";
import { isHttpsUrl, logDebug, normalizeServerUrl } from "./utils";

const { core, event, menu, mpv, preferences, sidebar, utils } = iina;

const SIDEBAR_VISIBILITY_POLL_MS = 200;

logDebug("Jellyfin: Plugin loaded");

let windowReady = false;
let windowClosed = false;
let pendingShowSidebar = false;
let sidebarVisible = false;
let backdropPreviewsEnabled = true;
let activeBackdropItemId = "";
let sidebarVisibilityTimer: ReturnType<typeof setInterval> | null = null;
const jellyfinSplashUrl = resolveJellyfinSplashUrl(path => iina.file.exists(path));
const jellyfinSplashPaths = new Set(JELLYFIN_SPLASH_URLS.flatMap(path => {
    try {
        return [path, utils.resolvePath(path)].filter(Boolean);
    } catch {
        return [path];
    }
}));

function getSidebarVisibility(): boolean {
    const sidebarWithVisibility = sidebar as typeof sidebar & { isVisible?: () => boolean };
    const trackedOpen = typeof sidebarWithVisibility.isVisible === "function"
        ? sidebarWithVisibility.isVisible()
        : sidebarVisible;

    return isJellyfinSidebarOpen(core.window.sidebar, trackedOpen);
}

function showSidebarWithNotification(): void {
    sidebar.show();
    sidebarVisible = true;
    syncBackdropEligibility();
}

function showSidebarWithDelay(): void {
    setTimeout(() => {
        showSidebarWithNotification();
    }, SHOW_SIDEBAR_DELAY_MS);
}

function hideSidebar(): void {
    sidebar.hide();
    sidebarVisible = false;
    syncBackdropEligibility();
}

function showHttpsAlert(): void {
    utils.ask("Jellyfin requires an https:// server URL. HTTP is not supported.");
}

function getPreferEpisodeImagesInNextUp(): boolean {
    const value = preferences.get(PREFER_EPISODE_IMAGES_IN_NEXT_UP_PREF_KEY);
    return Boolean(value);
}

function getBackdropPreviewsEnabled(): boolean {
    const value = preferences.get(BACKDROP_PREVIEWS_PREF_KEY);
    if (value === undefined || value === null) {
        return true;
    }
    return Boolean(value);
}

function postSidebarPreferences(): void {
    sidebar.postMessage(MESSAGE_NAMES.SidebarPreferences, {
        backdropPreviewsEnabled,
        preferEpisodeImagesInNextUp: getPreferEpisodeImagesInNextUp()
    });
}

function syncBackdropEligibility(): void {
    if (!windowReady) {
        setBackdropPresentation("hidden", "");
        return;
    }
    const mode = resolveBackdropMode({
        playbackPaused: mpv.getFlag("pause"),
        jellyfinPlaybackActive: Boolean(activeBackdropItemId),
        mediaPath: mpv.getString("path"),
        splashPaths: [...jellyfinSplashPaths],
        jellyfinSidebarOpen: getSidebarVisibility(),
        previewsEnabled: backdropPreviewsEnabled
    });
    setBackdropPresentation(mode, mode === "paused" ? activeBackdropItemId : "");
}

function startSidebarVisibilityPolling(): void {
    if (sidebarVisibilityTimer) {
        return;
    }
    sidebarVisibilityTimer = setInterval(syncBackdropEligibility, SIDEBAR_VISIBILITY_POLL_MS);
}

function stopSidebarVisibilityPolling(): void {
    if (!sidebarVisibilityTimer) {
        return;
    }
    clearInterval(sidebarVisibilityTimer);
    sidebarVisibilityTimer = null;
}

function toggleSidebarFromHotkey(): void {
    if (!windowReady) {
        pendingShowSidebar = true;
        if (shouldOpenJellyfinSplash({
            windowReady,
            windowClosed,
            windowLoaded: core.window.loaded,
            mediaPath: mpv.getString("path")
        })) {
            core.open(jellyfinSplashUrl);
        }
        return;
    }

    if (getSidebarVisibility()) {
        logDebug("Jellyfin: Sidebar already open, hiding it");
        hideSidebar();
        return;
    }

    showSidebarWithDelay();
}

menu.addItem(menu.item("Jellyfin", toggleSidebarFromHotkey, { keyBinding: "Shift+J" }));

initializeMediaOverlay();
void addResolvedDevSplashPath();

event.on("mpv.pause.changed", syncBackdropEligibility);
event.on("iina.window-will-close", () => {
    stopSidebarVisibilityPolling();
    windowReady = false;
    windowClosed = true;
    sidebarVisible = false;
    syncBackdropEligibility();
});

const playbackController = initializePlaybackHandlers({
    hideSidebar,
    showSidebar: showSidebarWithNotification,
    refreshSidebar: () => {
        sidebar.postMessage(MESSAGE_NAMES.RefreshSidebar, {});
    },
    showHttpsAlert,
    setActiveBackdropItem: itemId => {
        activeBackdropItemId = itemId;
        syncBackdropEligibility();
    },
    clearActiveBackdropItem: () => {
        activeBackdropItemId = "";
        syncBackdropEligibility();
    },
    isSplashPath: path => isJellyfinSplashPath(path, [...jellyfinSplashPaths])
});

event.on("iina.window-loaded", () => {
    logDebug("Jellyfin: Window loaded");

    windowClosed = false;
    backdropPreviewsEnabled = getBackdropPreviewsEnabled();
    loadMediaOverlay();
    sidebar.loadFile("ui/sidebar.html");

    sidebar.onMessage(MESSAGE_NAMES.PlayItem, (data: PlayItemPayload) => {
        logDebug("Jellyfin: Received playItem");
        playbackController.play(data);
    });

    sidebar.onMessage(MESSAGE_NAMES.BackdropContext, (data: BackdropContextPayload) => {
        setBackdropContext(data);
    });

    sidebar.onMessage(
        MESSAGE_NAMES.SidebarVisibilityChanged,
        (data: SidebarVisibilityChangedPayload) => {
            sidebarVisible = Boolean(data?.visible);
            setSidebarWidth(data?.viewportWidth);
            syncBackdropEligibility();
        }
    );

    sidebar.onMessage(MESSAGE_NAMES.AuthUpdated, (data: AuthUpdatedPayload) => {
        if (!data || !data.serverUrl) {
            return;
        }
        const normalizedUrl = normalizeServerUrl(data.serverUrl);
        if (!isHttpsUrl(normalizedUrl)) {
            showHttpsAlert();
            return;
        }
        updateAuthState({
            ...data,
            serverUrl: normalizedUrl
        });
        refreshMediaOverlay();
        postSidebarPreferences();
    });

    sidebar.onMessage(MESSAGE_NAMES.AuthCleared, () => {
        clearBackdropContext();
        clearAuthState();
    });

    windowReady = true;
    startSidebarVisibilityPolling();
    syncBackdropEligibility();

    if (pendingShowSidebar) {
        logDebug("Jellyfin: Showing sidebar (pending request)");
        showSidebarWithDelay();
        pendingShowSidebar = false;
    }

    logDebug("Jellyfin: Ready");
});

async function addResolvedDevSplashPath(): Promise<void> {
    try {
        const devPluginRoot = utils.resolvePath(JELLYFIN_DEV_PLUGIN_ROOT);
        const result = await utils.exec("/usr/bin/readlink", [devPluginRoot]);
        const resolvedRoot = result.status === 0 ? result.stdout.trim().replace(/\/+$/, "") : "";
        if (!resolvedRoot.startsWith("/")) {
            return;
        }
        jellyfinSplashPaths.add(`${resolvedRoot}/assets/Jellyfin.png`);
        syncBackdropEligibility();
    } catch {
        // A normal installed plugin is a directory rather than a development symlink.
    }
}
