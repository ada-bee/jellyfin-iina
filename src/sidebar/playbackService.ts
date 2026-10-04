import type {
    JellyfinBaseItem,
    JellyfinPlaybackInfoResponse,
    PlaybackHandoff
} from "../jellyfin/types";
import { buildJellyfinWindowTitle, buildPlaybackHandoff } from "../playback/negotiation";
import type { PlaybackStreamSelection } from "../playback/negotiation";
import { TICKS_PER_SECOND } from "../shared/constants";

export interface PlaybackContext extends PlaybackStreamSelection {
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
    fetchPlaybackInfo(
        itemId: string,
        selection: PlaybackStreamSelection
    ): Promise<JellyfinPlaybackInfoResponse | null>;
    fetchItemDetails(itemId: string): Promise<JellyfinBaseItem | null>;
    getConnection(): SidebarConnection;
    getDeviceId(): string;
    send(message: PlayItemMessage): void;
    reportError(error: unknown): void;
}

export function createPlayItem(
    dependencies: SidebarPlaybackDependencies,
    mode: "latest" | "ordered" = "latest"
) {
    let generation = 0;
    let queued = Promise.resolve();

    function playItem(
        itemId: string,
        name: string,
        resumePositionTicks: number = 0,
        context: PlaybackContext = {},
        preferredTitle: string = ""
    ): Promise<void> {
        const requestGeneration = mode === "latest" ? ++generation : generation;
        const connection = { ...dependencies.getConnection() };
        const deviceId = dependencies.getDeviceId();
        const selection = { ...context };
        const isCurrent = () => requestGeneration === generation
            && isSameConnection(connection, dependencies.getConnection());

        async function run(): Promise<void> {
            if (!isCurrent()) {
                return;
            }
            try {
                const playbackInfo = await dependencies.fetchPlaybackInfo(itemId, selection);
                if (!isCurrent()) {
                    return;
                }
                if (!playbackInfo) {
                    throw new Error("Missing playback info");
                }
                const itemDetails = await dependencies.fetchItemDetails(itemId);
                if (!isCurrent()) {
                    return;
                }
                const playback = buildPlaybackHandoff(playbackInfo, {
                    ...connection,
                    deviceId,
                    itemId,
                    runtimeTicks: itemDetails?.RunTimeTicks,
                    ...resolvePlaybackContext(selection, itemDetails)
                });
                const title = preferredTitle || buildJellyfinWindowTitle(itemDetails, name) || name;
                dependencies.send({
                    playback,
                    resumeSeconds: toResumeSeconds(resumePositionTicks),
                    title
                });
            } catch (error) {
                if (isCurrent()) {
                    dependencies.reportError(error);
                }
            }
        }

        if (mode === "ordered") {
            queued = queued.then(run, run);
            return queued;
        }
        return run();
    }

    return Object.assign(playItem, {
        cancel(): void {
            generation += 1;
            queued = Promise.resolve();
        }
    });
}

function isSameConnection(left: SidebarConnection, right: SidebarConnection): boolean {
    return left.serverUrl === right.serverUrl
        && left.accessToken === right.accessToken
        && left.userId === right.userId;
}

function resolvePlaybackContext(
    preferred: PlaybackContext,
    item: JellyfinBaseItem | null
): PlaybackContext {
    return {
        seriesId: preferred.seriesId || item?.SeriesId || "",
        seasonId: preferred.seasonId || item?.SeasonId || item?.ParentId || "",
        episodeIndex: preferred.episodeIndex ?? item?.IndexNumber,
        mediaSourceId: preferred.mediaSourceId,
        audioStreamIndex: preferred.audioStreamIndex,
        subtitleStreamIndex: preferred.subtitleStreamIndex
    };
}

function toResumeSeconds(resumePositionTicks: number): number {
    return resumePositionTicks > 0
        ? Math.floor(resumePositionTicks / TICKS_PER_SECOND)
        : 0;
}
