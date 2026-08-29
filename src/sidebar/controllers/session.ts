import { authenticateUser, fetchServerName } from "../../adapters/browser/sidebarApi";
import { clearBackdropContext } from "../backdropContext";
import { ui } from "../dom";
import { showBrowseView, showLoginView } from "../views";
import { sidebarStore, state } from "../../sidebar/store";
import {
    clearSessionFromStorage,
    loadSessionFromStorage,
    saveSessionToStorage
} from "../../adapters/browser/storage";
import { getServerHost, isHttpsUrl, normalizeServerUrl } from "../runtimeUtils";
import { goHomeFresh, resetSearchState } from "./navigation";
import { clearSidebarRequestCaches } from "./loaders";
import { MESSAGE_NAMES } from "../../jellyfin/messages";

function normalizeAndValidateUrl(rawUrl: string): string | null {
    const normalizedUrl = normalizeServerUrl(rawUrl);
    if (!normalizedUrl) {
        ui.loginError.textContent = "Please enter a server URL.";
        return null;
    }
    if (!isHttpsUrl(normalizedUrl)) {
        ui.loginError.textContent = "Jellyfin requires an https:// server URL.";
        return null;
    }
    return normalizedUrl;
}

export function restoreSessionFromStorage(): boolean {
    const savedSession = loadSessionFromStorage();
    if (!savedSession) {
        sendAuthCleared();
        showLoginView();
        return false;
    }

    const normalizedUrl = normalizeServerUrl(savedSession.serverUrl);
    if (!normalizedUrl || !isHttpsUrl(normalizedUrl)) {
        clearSessionFromStorage();
        sendAuthCleared();
        showLoginView();
        return false;
    }

    sidebarStore.patch({
        serverUrl: normalizedUrl,
        accessToken: savedSession.accessToken,
        userId: savedSession.userId,
        username: savedSession.username,
        serverName: savedSession.serverName || getServerHost(normalizedUrl)
    });
    showBrowseView();
    resetSearchState(false);
    sendAuthUpdated();
    return true;
}

export async function handleLogin(event: Event): Promise<void> {
    event.preventDefault();

    const serverUrlInput = ui.serverUrlInput.value.trim();
    const username = ui.usernameInput.value.trim();
    const password = ui.passwordInput.value;

    ui.connectBtn.disabled = true;
    ui.connectBtn.textContent = "Connecting...";
    ui.loginError.textContent = "";

    const normalizedUrl = normalizeAndValidateUrl(serverUrlInput);
    if (!normalizedUrl) {
        ui.connectBtn.disabled = false;
        ui.connectBtn.textContent = "Connect";
        return;
    }

    try {
        const authData = await authenticateUser(normalizedUrl, username, password);
        sidebarStore.patch({
            serverUrl: normalizedUrl,
            accessToken: authData.AccessToken || "",
            userId: authData.User?.Id || "",
            username: authData.User?.Name || ""
        });

        const serverDisplayName = await fetchServerName();
        const serverHostValue = getServerHost(state.serverUrl);
        sidebarStore.patch({ serverName: serverDisplayName || serverHostValue });

        saveSessionToStorage({
            serverUrl: state.serverUrl,
            serverName: state.serverName,
            accessToken: state.accessToken,
            userId: state.userId,
            username: state.username
        });

        ui.connectBtn.disabled = false;
        ui.connectBtn.textContent = "Connect";
        showBrowseView();
        resetSearchState(false);
        sendAuthUpdated();
        goHomeFresh("login");
    } catch (error) {
        ui.connectBtn.disabled = false;
        ui.connectBtn.textContent = "Connect";
        const message = error instanceof Error ? error.message : "Connection failed";
        ui.loginError.textContent = message || "Connection failed";
    }
}

export function handleAuthenticationFailure(): void {
    const serverUrl = state.serverUrl;
    const username = state.username;
    clearActiveSession();

    ui.serverUrlInput.value = serverUrl;
    ui.usernameInput.value = username;
    ui.passwordInput.value = "";
    ui.loginError.textContent = "Your Jellyfin session expired. Sign in again.";
    showLoginView();
}

function clearActiveSession(): void {
    clearBackdropContext();
    clearSidebarRequestCaches();
    sidebarStore.navigateHome();
    sidebarStore.patch({
        serverUrl: "",
        serverName: "",
        accessToken: "",
        userId: "",
        username: "",
        currentLibrary: null,
        currentSeries: null,
        retryOperation: null
    });

    clearSessionFromStorage();
    sendAuthCleared();
}

export function sendAuthUpdated(): void {
    if (!state.serverUrl || !state.accessToken || !state.userId) {
        return;
    }

    iina.postMessage(MESSAGE_NAMES.AuthUpdated, {
        serverUrl: state.serverUrl,
        accessToken: state.accessToken,
        userId: state.userId,
        username: state.username,
        deviceId: state.deviceId,
        serverName: state.serverName
    });
}

export function sendAuthCleared(): void {
    iina.postMessage(MESSAGE_NAMES.AuthCleared, {});
}
