import type { SidebarPreferencesPayload } from "../../shared/messages";

import { MESSAGE_NAMES } from "../../shared/messages";
import { setAuthenticationFailureHandler } from "../api";
import { state } from "../state";
import { getDeviceId } from "../storage";
import { setupEventListeners } from "./events";
import { goHomeFresh } from "./navigation";
import { handleAuthenticationFailure, restoreSessionFromStorage } from "./session";

function applySidebarPreferences(payload: SidebarPreferencesPayload): void {
    const preferEpisodeImagesInNextUp = Boolean(payload?.preferEpisodeImagesInNextUp);
    state.preferEpisodeImagesInNextUp = preferEpisodeImagesInNextUp;
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
        state.deviceId = getDeviceId();

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
