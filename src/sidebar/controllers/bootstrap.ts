import type { SidebarPreferencesPayload } from "../../jellyfin/messages";

import { MESSAGE_NAMES } from "../../jellyfin/messages";
import { sidebarStore, state } from "../../sidebar/store";
import { setAuthenticationFailureHandler } from "../../adapters/browser/sidebarApi";
import { getDeviceId } from "../../adapters/browser/storage";
import { setupEventListeners } from "./events";
import { goHomeFresh } from "./navigation";
import { handleAuthenticationFailure, restoreSessionFromStorage } from "./session";

function applySidebarPreferences(payload: SidebarPreferencesPayload): void {
    const backdropPreviewsEnabled = payload?.backdropPreviewsEnabled !== false;
    const preferEpisodeImagesInNextUp = Boolean(payload?.preferEpisodeImagesInNextUp);
    sidebarStore.patch({ backdropPreviewsEnabled, preferEpisodeImagesInNextUp });
}

export function initSidebar(): void {
    let sidebarReady = false;
    let pendingSidebarRefresh = false;

    setAuthenticationFailureHandler(handleAuthenticationFailure);

    iina.onMessage(MESSAGE_NAMES.SidebarPreferences, (payload: SidebarPreferencesPayload) => {
        applySidebarPreferences(payload);
    });

    iina.onMessage(MESSAGE_NAMES.RefreshSidebar, () => {
        if (!sidebarReady) {
            pendingSidebarRefresh = true;
            return;
        }
        if (!state.accessToken || !state.userId) {
            return;
        }
        pendingSidebarRefresh = false;
        goHomeFresh("refreshSidebar");
    });

    document.addEventListener("DOMContentLoaded", () => {
        setupEventListeners();
        sidebarStore.patch({ deviceId: getDeviceId() });

        const restored = restoreSessionFromStorage();
        if (restored) {
            goHomeFresh("session-restore");
        }

        sidebarReady = true;
        if (pendingSidebarRefresh) {
            if (state.accessToken && state.userId) {
                goHomeFresh("pending");
            }
            pendingSidebarRefresh = false;
        }
    });
}
