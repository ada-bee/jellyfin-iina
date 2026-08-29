import type {
    JellyfinBaseItem,
    JellyfinPlaybackInfoResponse,
    PlaybackHandoff
} from "../jellyfin/types";
import { buildJellyfinWindowTitle, buildPlaybackHandoff } from "../playback/negotiation";
import { TICKS_PER_SECOND } from "../shared/constants";

export interface PlaybackContext {
    seriesId?: string;
    seasonId?: string;
    episodeIndex?: number | null;
}

interface SidebarConnection {
    serverUrl: string;
    accessToken: string;
    userId: string;
}

interface PlayItemMessage {
    playback: PlaybackHandoff;
    resumeSeconds: number;
    title: string;
}

export interface SidebarPlaybackDependencies {
    fetchPlaybackInfo(itemId: string): Promise<JellyfinPlaybackInfoResponse | null>;
    fetchItemDetails(itemId: string): Promise<JellyfinBaseItem | null>;
    getConnection(): SidebarConnection;
    getDeviceId(): string;
    send(message: PlayItemMessage): void;
    reportError(error: unknown): void;
}

export function createPlayItem(dependencies: SidebarPlaybackDependencies) {
    return async function playItem(
        itemId: string,
        name: string,
        resumePositionTicks: number = 0,
        context: PlaybackContext = {},
        preferredTitle: string = ""
    ): Promise<void> {
        try {
            const playbackInfo = await dependencies.fetchPlaybackInfo(itemId);
            if (!playbackInfo) {
                throw new Error("Missing playback info");
            }
            const itemDetails = await dependencies.fetchItemDetails(itemId);
            const connection = dependencies.getConnection();
            const resolvedContext = resolvePlaybackContext(context, itemDetails);
            const playback = buildPlaybackHandoff(playbackInfo, {
                ...connection,
                deviceId: dependencies.getDeviceId(),
                itemId,
                runtimeTicks: itemDetails?.RunTimeTicks,
                ...resolvedContext
            });
            const title = preferredTitle || buildJellyfinWindowTitle(itemDetails, name) || name;
            dependencies.send({
                playback,
                resumeSeconds: toResumeSeconds(resumePositionTicks),
                title
            });
        } catch (error) {
            dependencies.reportError(error);
        }
    };
}

function resolvePlaybackContext(
    preferred: PlaybackContext,
    item: JellyfinBaseItem | null
): PlaybackContext {
    return {
        seriesId: preferred.seriesId || item?.SeriesId || "",
        seasonId: preferred.seasonId || item?.SeasonId || item?.ParentId || "",
        episodeIndex: preferred.episodeIndex ?? item?.IndexNumber
    };
}

function toResumeSeconds(resumePositionTicks: number): number {
    return resumePositionTicks > 0
        ? Math.floor(resumePositionTicks / TICKS_PER_SECOND)
        : 0;
}
