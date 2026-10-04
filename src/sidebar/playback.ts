import { MESSAGE_NAMES } from "../jellyfin/messages";
import { fetchItemDetails, fetchPlaybackInfo } from "../adapters/browser/sidebarApi";
import { showError } from "./views";
import { state } from "./store";
import { getDeviceId } from "../adapters/browser/storage";
import { createPlayItem, type SidebarPlaybackDependencies } from "./playbackService";

export type { PlaybackContext } from "./playbackService";

const playbackDependencies = {
    fetchPlaybackInfo,
    fetchItemDetails,
    getConnection: () => ({
        serverUrl: state.serverUrl,
        accessToken: state.accessToken,
        userId: state.userId
    }),
    getDeviceId
} satisfies Omit<SidebarPlaybackDependencies, "send" | "reportError">;

export const playItem = createPlayItem({
    ...playbackDependencies,
    send: message => iina.postMessage(MESSAGE_NAMES.PlayItem, message),
    reportError: error => {
        console.error("Failed to get playback info:", error);
        showError(error instanceof Error ? error.message : "Unable to start playback.");
    }
});

export const queueItem = createPlayItem({
    ...playbackDependencies,
    send: message => iina.postMessage(MESSAGE_NAMES.QueueItem, message),
    reportError: error => {
        console.error("Failed to get queue item playback info:", error);
        showError(error instanceof Error ? error.message : "Unable to queue this item.");
    }
}, "ordered");

export function cancelPendingPlaybackRequests(): void {
    playItem.cancel();
    queueItem.cancel();
}
