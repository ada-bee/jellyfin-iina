import { MESSAGE_NAMES } from "../jellyfin/messages";
import { fetchItemDetails, fetchPlaybackInfo } from "../adapters/browser/sidebarApi";
import { showError } from "./views";
import { state } from "./store";
import { getDeviceId } from "../adapters/browser/storage";
import { createPlayItem } from "./playbackService";

export type { PlaybackContext } from "./playbackService";

export const playItem = createPlayItem({
    fetchPlaybackInfo,
    fetchItemDetails,
    getConnection: () => ({
        serverUrl: state.serverUrl,
        accessToken: state.accessToken,
        userId: state.userId
    }),
    getDeviceId,
    send: message => iina.postMessage(MESSAGE_NAMES.PlayItem, message),
    reportError: error => {
        console.error("Failed to get playback info:", error);
        showError(error instanceof Error ? error.message : "Unable to start playback.");
    }
});
