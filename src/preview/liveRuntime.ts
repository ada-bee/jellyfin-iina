import { setupEventListeners } from "../sidebar/controllers/events";
import { loadHome } from "../sidebar/controllers/loaders";
import { ui } from "../sidebar/dom";
import { showBrowseView, showError, showLoading, updateTitle } from "../sidebar/views";
import { state } from "../sidebar/store";
import { getDeviceId } from "../adapters/browser/storage";

interface LivePreviewSession {
    serverUrl: string;
    accessToken: string;
    userId: string;
    username: string;
    serverName: string;
}

let retryingSession = false;

export function setupLivePreview(): void {
    setupEventListeners();
    ui.retryBtn.addEventListener("click", handleSessionRetry, { capture: true });
    void loadLivePreview();
}

async function loadLivePreview(): Promise<void> {
    retryingSession = false;
    document.documentElement.dataset.previewState = "live";
    document.title = "Jellyfin sidebar — live";
    showBrowseView();
    updateTitle("Home");
    showLoading();

    try {
        const session = await fetchLivePreviewSession();
        Object.assign(state, {
            ...session,
            deviceId: getDeviceId(),
            preferEpisodeImagesInNextUp: false
        });
        await loadHome();
    } catch (error) {
        retryingSession = true;
        showError(error instanceof Error ? error.message : "Could not load the IINA Jellyfin session");
    }
}

async function fetchLivePreviewSession(): Promise<LivePreviewSession> {
    const response = await fetch("/__preview/session", { cache: "no-store" });
    if (!response.ok) {
        throw new Error(await response.text());
    }
    return await response.json() as LivePreviewSession;
}

function handleSessionRetry(event: Event): void {
    if (!retryingSession) {
        return;
    }
    event.stopImmediatePropagation();
    void loadLivePreview();
}
