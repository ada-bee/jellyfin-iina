import type { PlaybackApi, PlaybackSession } from "../../playback/ports";
import type {
    JellyfinPlaybackProgressInfo,
    JellyfinPlaybackStartInfo,
    JellyfinPlaybackStopInfo
} from "../../jellyfin/types";

import { resolveAutoplayNextEpisode } from "./autoplay";
import { requestJson } from "./apiClient";
import { requestMediaSegments } from "./segmentsApi";

export class IinaPlaybackApi implements PlaybackApi {
    async reportStart(playback: PlaybackSession, positionTicks: number): Promise<void> {
        const context = playback;
        if (!hasHttpContext(context)) {
            return;
        }
        const body: JellyfinPlaybackStartInfo = {
            ItemId: context.itemId,
            MediaSourceId: context.mediaSourceId,
            PlaySessionId: context.playSessionId,
            PositionTicks: positionTicks,
            CanSeek: true,
            IsPaused: false,
            PlayMethod: context.playMethod,
            AudioStreamIndex: context.audioStreamIndex,
            SubtitleStreamIndex: context.subtitleStreamIndex
        };
        await requestJson(context, {
            method: "POST",
            endpoint: "/Sessions/Playing",
            body
        });
    }

    async reportProgress(
        playback: PlaybackSession,
        positionTicks: number,
        isPaused: boolean
    ): Promise<void> {
        const context = playback;
        if (!hasHttpContext(context)) {
            return;
        }
        const body: JellyfinPlaybackProgressInfo = {
            ItemId: context.itemId,
            MediaSourceId: context.mediaSourceId,
            PlaySessionId: context.playSessionId,
            PositionTicks: positionTicks,
            IsPaused: Boolean(isPaused),
            PlayMethod: context.playMethod,
            AudioStreamIndex: context.audioStreamIndex,
            SubtitleStreamIndex: context.subtitleStreamIndex
        };
        await requestJson(context, {
            method: "POST",
            endpoint: "/Sessions/Playing/Progress",
            body
        });
    }

    async reportStopped(playback: PlaybackSession, positionTicks: number): Promise<void> {
        const context = playback;
        if (!hasHttpContext(context)) {
            return;
        }
        const body: JellyfinPlaybackStopInfo = {
            ItemId: context.itemId,
            MediaSourceId: context.mediaSourceId,
            PlaySessionId: context.playSessionId,
            PositionTicks: positionTicks
        };
        await requestJson(context, {
            method: "POST",
            endpoint: "/Sessions/Playing/Stopped",
            body
        });
    }

    resolveNextEpisode(playback: PlaybackSession) {
        return resolveAutoplayNextEpisode(playback);
    }

    getSegments(playback: PlaybackSession) {
        return requestMediaSegments(playback);
    }
}

function hasHttpContext(playback: PlaybackSession): boolean {
    return Boolean(playback.serverUrl && playback.accessToken && playback.deviceId);
}
