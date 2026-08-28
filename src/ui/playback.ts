import { MESSAGE_NAMES } from "../shared/messages";
import { buildJellyfinWindowTitle, buildPlaybackHandoff } from "../shared/playback";
import { TICKS_PER_SECOND } from "./constants";
import { fetchItemDetails, fetchPlaybackInfo } from "./api";
import { showError } from "./render";
import { state } from "./state";
import { getDeviceId } from "./storage";

export interface PlaybackContext {
    seriesId?: string;
    seasonId?: string;
    episodeIndex?: number | null;
}

function openInIINA(
    playback: ReturnType<typeof buildPlaybackHandoff>,
    resumeSeconds: number = 0,
    title: string = ""
): void {
    iina.postMessage(MESSAGE_NAMES.PlayItem, { playback, resumeSeconds, title });
}

export async function playItem(
    itemId: string,
    name: string,
    resumePositionTicks: number = 0,
    context: PlaybackContext = {},
    preferredTitle: string = ""
): Promise<void> {
    try {
        const playbackInfo = await fetchPlaybackInfo(itemId);
        if (!playbackInfo) {
            throw new Error("Missing playback info");
        }
        const itemDetails = await fetchItemDetails(itemId);
        const windowTitle = preferredTitle || buildJellyfinWindowTitle(itemDetails, name);

        const resolvedContext = {
            seriesId: context.seriesId || itemDetails?.SeriesId || "",
            seasonId: context.seasonId || itemDetails?.SeasonId || itemDetails?.ParentId || "",
            episodeIndex: context.episodeIndex !== undefined && context.episodeIndex !== null
                ? context.episodeIndex
                : itemDetails?.IndexNumber
        };

        const playback = buildPlaybackHandoff(playbackInfo, {
            serverUrl: state.serverUrl,
            accessToken: state.accessToken,
            deviceId: getDeviceId(),
            userId: state.userId,
            itemId: itemId,
            runtimeTicks: itemDetails?.RunTimeTicks,
            seriesId: resolvedContext.seriesId,
            seasonId: resolvedContext.seasonId,
            episodeIndex: resolvedContext.episodeIndex
        });

        const resumeSeconds = resumePositionTicks > 0
            ? Math.floor(resumePositionTicks / TICKS_PER_SECOND)
            : 0;

        openInIINA(playback, resumeSeconds, windowTitle || name);
    } catch (error) {
        console.error("Failed to get playback info:", error);
        showError(error instanceof Error ? error.message : "Unable to start playback.");
    }
}
