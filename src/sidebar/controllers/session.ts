import { authenticateUser, invalidateAuthenticationRequests } from "../../adapters/browser/sidebarApi";
import {
    fetchSessionServerName,
    InvalidSessionIdentityError,
    validateStoredSession
} from "../../adapters/browser/sessionApi";
import { clearBackdropContext } from "../backdropContext";
import { ui } from "../dom";
import { showBrowseView, showLoginView } from "../views";
import { sidebarStore, state } from "../../sidebar/store";
import {
    clearSessionFromStorage,
    loadSessionFromStorage,
    saveSessionToStorage,
    type StoredSession
} from "../../adapters/browser/storage";
import { getServerHost, isHttpsUrl, normalizeServerUrl } from "../runtimeUtils";
import { goHomeFresh, resetSearchState } from "./navigation";
import { clearSidebarRequestCaches } from "./loaders";
import { cancelPendingPlaybackRequests } from "../playback";
import { isConfirmedAuthenticationFailure } from "../../jellyfin/apiError";
import { MESSAGE_NAMES } from "../../jellyfin/messages";

let sessionOperation = 0;

function normalizeAndValidateUrl(rawUrl: string): string | null {
    const normalizedUrl = normalizeServerUrl(rawUrl);
    if (!normalizedUrl) {
        ui.loginError.textContent = "Please enter a server URL.";
        return null;
    }
    if (!isHttpsUrl(normalizedUrl)) {
        ui.loginError.textContent = "This plugin requires an https:// server URL.";
        return null;
    }
    return normalizedUrl;
}

function startSessionOperation(): number {
    invalidateAuthenticationRequests();
    cancelPendingPlaybackRequests();
    return ++sessionOperation;
}

function activateSession(session: StoredSession): void {
    sidebarStore.patch(session);
    ui.passwordInput.value = "";
    showBrowseView();
    resetSearchState(false);
    sendAuthUpdated();
}

export async function restoreSessionFromStorage(): Promise<boolean> {
    const operation = startSessionOperation();
    let savedSession: StoredSession | null = null;
    try {
        savedSession = await loadSessionFromStorage();
        if (operation !== sessionOperation) return false;
        if (!savedSession) {
            sendAuthCleared();
            showLoginView();
            return false;
        }
        ui.serverUrlInput.value = savedSession.serverUrl;
        ui.usernameInput.value = savedSession.username;
        const normalizedUrl = normalizeAndValidateUrl(savedSession.serverUrl);
        if (!normalizedUrl) {
            sendAuthCleared();
            showLoginView();
            return false;
        }
        savedSession = {
            ...savedSession,
            serverUrl: normalizedUrl,
            serverName: savedSession.serverName || getServerHost(normalizedUrl)
        };
        const session = await validateStoredSession(savedSession);
        if (operation !== sessionOperation) return false;
        activateSession(session);
        return true;
    } catch (error) {
        if (operation === sessionOperation) {
            return handleRestoreFailure(error, savedSession);
        }
        return false;
    }
}

function handleRestoreFailure(error: unknown, session: StoredSession | null): boolean {
    if (isConfirmedAuthenticationFailure(error) && session) {
        clearActiveSession(session);
        ui.loginError.textContent = "Your Jellyfin session expired. Sign in again.";
    } else if (error instanceof InvalidSessionIdentityError) {
        deactivateSession();
        ui.loginError.textContent = error.message;
    } else if (session) {
        activateSession(session);
        return true;
    } else {
        sendAuthCleared();
        ui.loginError.textContent = "Could not access your saved Jellyfin session. Check Keychain access and sign in again. Your saved credentials were kept.";
    }
    showLoginView();
    return false;
}

function setConnecting(connecting: boolean): void {
    ui.connectBtn.disabled = connecting;
    ui.connectBtn.textContent = connecting ? "Connecting..." : "Connect";
}

async function authenticateSession(serverUrl: string, username: string, password: string): Promise<StoredSession> {
    const authData = await authenticateUser(serverUrl, username, password);
    if (!authData.AccessToken || !authData.User?.Id) {
        throw new Error("Jellyfin returned an incomplete sign-in response. Try again.");
    }
    return {
        serverUrl,
        serverName: getServerHost(serverUrl),
        accessToken: authData.AccessToken,
        userId: authData.User.Id,
        username: authData.User.Name || username
    };
}

export async function handleLogin(event: Event): Promise<void> {
    event.preventDefault();
    const normalizedUrl = normalizeAndValidateUrl(ui.serverUrlInput.value.trim());
    if (!normalizedUrl) return;
    const operation = startSessionOperation();
    setConnecting(true);
    ui.loginError.textContent = "";
    try {
        const session = await authenticateSession(normalizedUrl, ui.usernameInput.value.trim(), ui.passwordInput.value);
        if (operation !== sessionOperation) return;
        session.serverName = await fetchSessionServerName(session) || session.serverName;
        if (operation !== sessionOperation) return;
        await saveSessionToStorage(session);
        if (operation !== sessionOperation) return;
        activateSession(session);
        goHomeFresh("login");
    } catch (error) {
        if (operation === sessionOperation) {
            ui.loginError.textContent = error instanceof Error ? error.message : "Connection failed";
        }
    } finally {
        if (operation === sessionOperation) setConnecting(false);
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

function clearActiveSession(session: StoredSession = {
    serverUrl: state.serverUrl,
    serverName: state.serverName,
    accessToken: state.accessToken,
    userId: state.userId,
    username: state.username
}): void {
    const operation = deactivateSession();
    void clearSessionFromStorage(session).catch(() => {
        if (operation === sessionOperation) {
            ui.loginError.textContent = "Your session expired, but IINA could not clear its saved credentials. Check Keychain access and sign in again.";
        }
    });
}

function deactivateSession(): number {
    const operation = startSessionOperation();
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
    setConnecting(false);
    sendAuthCleared();
    return operation;
}

export function sendAuthUpdated(): void {
    if (!state.serverUrl || !state.accessToken || !state.userId) return;
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
