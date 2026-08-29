import type { AuthUpdatedPayload, PlayItemPayload, PreviewBackdropsPayload } from "../shared/messages";

import { MESSAGE_NAMES } from "../shared/messages";
import {
    BACKDROP_PREVIEWS_PREF_KEY,
    PREFER_EPISODE_IMAGES_IN_NEXT_UP_PREF_KEY,
    SHOW_SIDEBAR_DELAY_MS
} from "./constants";
import { handlePlayItem, initializePlaybackHandlers } from "./playback";
import {
    clearBackdropPreview,
    initializeMediaOverlay,
    loadMediaOverlay,
    previewBackdrops
} from "./mediaOverlay";
import { clearAuthState, updateAuthState } from "./state";
import { isHttpsUrl, logDebug, normalizeServerUrl } from "./utils";

const { console, event, global, preferences, sidebar, utils } = iina;

logDebug("Jellyfin: Plugin loaded");

let windowReady = false;
let pendingShowSidebar = false;
let sidebarVisible = false;

function getSidebarVisibility(): boolean {
    const sidebarWithVisibility = sidebar as typeof sidebar & { isVisible?: () => boolean };
    if (typeof sidebarWithVisibility.isVisible === "function") {
        return sidebarWithVisibility.isVisible();
    }

    return sidebarVisible;
}

function showSidebarWithNotification(): void {
    sidebar.show();
    sidebarVisible = true;
    global.postMessage("sidebarShown", {});
}

function showSidebarWithDelay(): void {
    setTimeout(() => {
        showSidebarWithNotification();
    }, SHOW_SIDEBAR_DELAY_MS);
}

function hideSidebar(): void {
    sidebar.hide();
    sidebarVisible = false;
    clearBackdropPreview();
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
        backdropPreviewsEnabled: getBackdropPreviewsEnabled(),
        preferEpisodeImagesInNextUp: getPreferEpisodeImagesInNextUp()
    });
}

function toggleSidebarFromHotkey(): void {
    if (!windowReady) {
        pendingShowSidebar = true;
        return;
    }

    if (getSidebarVisibility()) {
        logDebug("Jellyfin: Sidebar already open, hiding it");
        hideSidebar();
        return;
    }

    showSidebarWithDelay();
}

global.onMessage("showJellyfinSidebar", () => {
    logDebug("Jellyfin: Received showJellyfinSidebar message");
    toggleSidebarFromHotkey();
});

initializeMediaOverlay();

initializePlaybackHandlers({
    showSidebar: showSidebarWithNotification,
    refreshSidebar: () => {
        sidebar.postMessage(MESSAGE_NAMES.RefreshSidebar, {});
    }
});

event.on("iina.window-loaded", () => {
    logDebug("Jellyfin: Window loaded");

    loadMediaOverlay();
    sidebar.loadFile("ui/sidebar.html");

    sidebar.onMessage(MESSAGE_NAMES.PlayItem, (data: PlayItemPayload) => {
        logDebug("Jellyfin: Received playItem");
        handlePlayItem(data, {
            hideSidebar: hideSidebar,
            showHttpsAlert: showHttpsAlert
        });
    });

    sidebar.onMessage(MESSAGE_NAMES.PreviewBackdrops, (data: PreviewBackdropsPayload) => {
        if (!getBackdropPreviewsEnabled()) {
            clearBackdropPreview();
            return;
        }
        if (!getSidebarVisibility()) {
            return;
        }
        previewBackdrops(data);
    });

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
        postSidebarPreferences();
    });

    sidebar.onMessage(MESSAGE_NAMES.AuthCleared, () => {
        clearBackdropPreview();
        clearAuthState();
    });

    windowReady = true;

    global.postMessage("playerReady", {});

    if (pendingShowSidebar) {
        logDebug("Jellyfin: Showing sidebar (pending request)");
        showSidebarWithDelay();
        pendingShowSidebar = false;
    }

    logDebug("Jellyfin: Ready");
});
