import type {
    JellyfinPlaybackProgressInfo,
    JellyfinPlaybackStartInfo,
    JellyfinPlaybackStopInfo,
    PlaybackHandoff
} from "../shared/jellyfin";
import type { PlayItemPayload } from "../shared/messages";

import {
    EOF_WATCH_THRESHOLD_SECONDS,
    JELLYFIN_SPLASH_URL,
    PLAYBACK_TICK_INTERVAL_MS,
    PROGRESS_REPORT_INTERVAL_MS,
    RESUME_SEEK_DELAY_MS,
    TICKS_PER_SECOND
} from "./constants";
import { requestJson } from "./http";
import { clearPlaybackHandoffs, registerPlaybackHandoff, takePlaybackHandoff } from "./handoffs";
import { requestAutoplayNextEpisode, resetPlaylistAfterReplace, shouldRequestAutoplay } from "./autoplay";
import { clearSegmentState, startSegmentPolling } from "./segments";
import { loadExternalSubtitles } from "./subtitles";
import { syncSelectedTrackIndexes } from "./tracks";
import {
    getAuthState,
    getCurrentPlayback,
    PlaybackState,
    startCurrentPlayback,
    stopCurrentPlayback,
    updateCurrentPlaybackPosition
} from "./state";
import {
    formatError,
    isHttpsUrl,
    logDebug,
    redactUrlForLog,
    sanitizeMediaTitle
} from "./utils";

const { console, core, event, mpv } = iina;

let pendingWindowTitle: string | null = null;
let shouldResetPlaylistOnNextLoad = false;
let playbackTickTimer: ReturnType<typeof setInterval> | null = null;
let playbackTickCount = 0;

export interface PlaybackHandlersOptions {
    showSidebar: () => void;
    refreshSidebar: () => void;
}

export function handlePlayItem(
    data: PlayItemPayload,
    options: { hideSidebar: () => void; showHttpsAlert: () => void }
): void {
    if (!data || !data.playback || !data.playback.url) {
        return;
    }

    const playback = data.playback;
    const url = String(playback.url);
    if (!isHttpsUrl(url) || !isHttpsUrl(playback.serverUrl)) {
        options.showHttpsAlert();
        return;
    }

    registerPlaybackHandoff(playback);
    pendingWindowTitle = data.title ? sanitizeMediaTitle(String(data.title)) : null;
    logDebug("Jellyfin: Playing URL:", redactUrlForLog(url, 80));

    stopActivePlayback("replacement requested");
    shouldResetPlaylistOnNextLoad = true;
    if (data.title) {
        const safeTitle = sanitizeMediaTitle(String(data.title));
        mpv.command("loadfile", [url, "replace", "-1", `force-media-title=${safeTitle}`]);
    } else {
        mpv.command("loadfile", [url, "replace"]);
    }

    options.hideSidebar();

    if (data.resumeSeconds && data.resumeSeconds > 0) {
        logDebug("Jellyfin: Will seek to", data.resumeSeconds, "seconds");
        setTimeout(() => {
            mpv.set("time-pos", data.resumeSeconds || 0);
        }, RESUME_SEEK_DELAY_MS);
    }
}

export function initializePlaybackHandlers(options: PlaybackHandlersOptions): void {
    event.on("mpv.file-loaded", () => {
        const url = mpv.getString("path");
        if (!url) {
            return;
        }

        if (url.includes("Jellyfin.png")) {
            logDebug("Jellyfin: Splash loaded, showing sidebar");
            clearPlaybackState("splash loaded");
            options.showSidebar();
            options.refreshSidebar();
            return;
        }

        const handoff = takePlaybackHandoff(url);
        if (!handoff) {
            clearPlaybackState("non-Jellyfin file loaded");
            return;
        }

        try {
            const playback = buildPlaybackState(handoff);
            if (!isHttpsUrl(playback.serverUrl)) {
                console.error("Jellyfin: Skipping HTTP playback reporting");
                return;
            }

            startPlaybackSession(playback, options);
        } catch (error) {
            logDebug("Jellyfin: URL parse error:", error instanceof Error ? error.message : error);
        }
    });

    event.on("mpv.end-file", () => {
        const playback = getCurrentPlayback();
        if (!playback) {
            return;
        }

        logDebug("Jellyfin: Playback ended");
        const autoplayQueued = playback.autoplayQueued;
        stopActivePlayback("end of playback");
        if (autoplayQueued) {
            return;
        }
        handleNoNextEpisode("end of playback", options);
    });

    event.on("mpv.pause.changed", () => {
        if (getCurrentPlayback()) {
            updateLastKnownPosition();
            void reportPlaybackProgress(mpv.getFlag("pause"));
        }
    });

    const handleTrackChange = () => {
        const playback = getCurrentPlayback();
        if (!playback) {
            return;
        }
        if (!playback.reportingStarted) {
            syncSelectedTrackIndexes(playback);
            return;
        }
        void reportPlaybackProgress(mpv.getFlag("pause"));
    };

    event.on("mpv.aid.changed", handleTrackChange);
    event.on("mpv.sid.changed", handleTrackChange);

    const handleShutdown = (reason: string) => {
        clearPlaybackState(reason);
    };

    event.on("iina.window-will-close", () => {
        handleShutdown("window close");
    });

    event.on("iina.application-will-terminate" as `mpv.${string}`, () => {
        handleShutdown("app terminate");
    });
}

function buildPlaybackState(handoff: PlaybackHandoff): PlaybackState {
    const { url: _url, ...context } = handoff;
    return {
        ...context,
        reportingStarted: false,
        autoplayQueued: false,
        autoplayRequestId: 0,
        nextItemId: "",
        segments: [],
        isEpisode: Boolean(
            context.seriesId
            || (context.episodeIndex !== null && context.episodeIndex !== undefined)
        )
    };
}

function startPlaybackSession(playback: PlaybackState, options: PlaybackHandlersOptions): void {
    logDebug("Jellyfin: Detected Jellyfin stream, starting playback reporting");
    stopActivePlayback("new Jellyfin file loaded");
    clearSegmentState();

    startCurrentPlayback(playback);

    playbackTickCount = 0;
    startPlaybackTick(options);

    if (pendingWindowTitle) {
        applyWindowTitle(pendingWindowTitle);
        pendingWindowTitle = null;
    }

    loadExternalSubtitles(playback);
    playback.reportingStarted = true;
    void reportPlaybackStart();
    startSegmentPolling();

    if (shouldResetPlaylistOnNextLoad) {
        resetPlaylistAfterReplace();
        shouldResetPlaylistOnNextLoad = false;
    }

    if (playback.isEpisode && shouldRequestAutoplay()) {
        void requestAutoplayNextEpisode();
    }
}

function applyWindowTitle(title: string): void {
    if (!title) {
        return;
    }

    const mpvWithSetString = mpv as typeof mpv & { setString?: (name: string, value: string) => void };
    if (typeof mpvWithSetString.setString === "function") {
        mpvWithSetString.setString("force-media-title", title);
    } else {
        mpv.set("force-media-title", title);
    }

    logDebug("Jellyfin: Set window title to", title);
}

function getPositionTicks(): number {
    return Math.floor((mpv.getNumber("time-pos") || 0) * TICKS_PER_SECOND);
}

function updateLastKnownPosition(): void {
    updateCurrentPlaybackPosition(getPositionTicks());
}

function resolveHttpContext(playback: PlaybackState) {
    const authState = getAuthState();
    const serverUrl = playback.serverUrl || authState?.serverUrl || "";
    const accessToken = playback.accessToken || authState?.accessToken || "";
    const deviceId = playback.deviceId || authState?.deviceId || "";
    if (!serverUrl || !accessToken || !deviceId) {
        return null;
    }
    return {
        serverUrl: serverUrl,
        accessToken: accessToken,
        deviceId: deviceId
    };
}

async function reportPlaybackStart(): Promise<void> {
    const playback = getCurrentPlayback();
    if (!playback) {
        return;
    }
    const httpContext = resolveHttpContext(playback);
    if (!httpContext) {
        return;
    }
    syncSelectedTrackIndexes(playback);
    logDebug("Jellyfin: Reporting playback start");
    logDebug("Jellyfin: ItemId:", playback.itemId, "PlaySessionId:", playback.playSessionId);

    try {
        const body: JellyfinPlaybackStartInfo = {
            ItemId: playback.itemId,
            MediaSourceId: playback.mediaSourceId,
            PlaySessionId: playback.playSessionId,
            PositionTicks: getPositionTicks(),
            CanSeek: true,
            IsPaused: false,
            PlayMethod: playback.playMethod,
            AudioStreamIndex: playback.audioStreamIndex,
            SubtitleStreamIndex: playback.subtitleStreamIndex
        };
        await requestJson(httpContext, {
            method: "POST",
            endpoint: "/Sessions/Playing",
            body: body
        });
    } catch (error) {
        console.error(`Jellyfin: Failed to report playback start: ${formatError(error)}`);
    }
}

async function reportPlaybackProgress(isPaused: boolean): Promise<void> {
    const playback = getCurrentPlayback();
    if (!playback) {
        return;
    }
    const httpContext = resolveHttpContext(playback);
    if (!httpContext) {
        return;
    }
    syncSelectedTrackIndexes(playback);

    try {
        const body: JellyfinPlaybackProgressInfo = {
            ItemId: playback.itemId,
            MediaSourceId: playback.mediaSourceId,
            PlaySessionId: playback.playSessionId,
            PositionTicks: getPositionTicks(),
            IsPaused: isPaused || false,
            PlayMethod: playback.playMethod,
            AudioStreamIndex: playback.audioStreamIndex,
            SubtitleStreamIndex: playback.subtitleStreamIndex
        };
        await requestJson(httpContext, {
            method: "POST",
            endpoint: "/Sessions/Playing/Progress",
            body: body
        });
    } catch (error) {
        console.error(`Jellyfin: Failed to report playback progress: ${formatError(error)}`);
    }
}

async function reportPlaybackStopped(playback: PlaybackState, positionTicks: number): Promise<void> {
    const httpContext = resolveHttpContext(playback);
    if (!httpContext) {
        return;
    }
    logDebug("Jellyfin: Reporting playback stopped at position:", positionTicks / TICKS_PER_SECOND);

    try {
        const body: JellyfinPlaybackStopInfo = {
            ItemId: playback.itemId,
            MediaSourceId: playback.mediaSourceId,
            PlaySessionId: playback.playSessionId,
            PositionTicks: positionTicks
        };
        await requestJson(httpContext, {
            method: "POST",
            endpoint: "/Sessions/Playing/Stopped",
            body: body
        });
    } catch (error) {
        console.error(`Jellyfin: Failed to report playback stopped: ${formatError(error)}`);
    }
}

function startPlaybackTick(options: PlaybackHandlersOptions): void {
    stopPlaybackTick();
    playbackTickTimer = setInterval(() => {
        const playback = getCurrentPlayback();
        if (!playback) {
            return;
        }
        updateLastKnownPosition();
        playbackTickCount += 1;

        if (playbackTickCount >= PROGRESS_REPORT_INTERVAL_MS / PLAYBACK_TICK_INTERVAL_MS) {
            playbackTickCount = 0;
            void reportPlaybackProgress(mpv.getFlag("pause"));
        }

        if (playback.autoplayQueued) {
            return;
        }

        const duration = mpv.getNumber("duration");
        const timePos = mpv.getNumber("time-pos");
        const paused = mpv.getFlag("pause");
        const eofReached = mpv.getFlag("eof-reached");

        if (!duration || duration <= 0 || timePos === undefined || timePos === null) {
            return;
        }

        const nearEnd = duration - timePos <= EOF_WATCH_THRESHOLD_SECONDS;
        if (!nearEnd) {
            return;
        }

        if (!paused && !eofReached) {
            return;
        }

        logDebug("Jellyfin: Playback reached EOF (tick)");
        stopActivePlayback("EOF tick");
        handleNoNextEpisode("eof tick", options);
    }, PLAYBACK_TICK_INTERVAL_MS);
}

function stopPlaybackTick(): void {
    if (playbackTickTimer) {
        clearInterval(playbackTickTimer);
        playbackTickTimer = null;
    }
}

function resetPlaybackRuntime(): void {
    stopPlaybackTick();
    clearSegmentState();
    playbackTickCount = 0;
}

function stopActivePlayback(reason: string): PlaybackState | null {
    const positionTicks = getPositionTicks();
    updateCurrentPlaybackPosition(positionTicks);
    const stopped = stopCurrentPlayback(positionTicks);
    if (!stopped) {
        return null;
    }

    logDebug(`Jellyfin: Stopping playback (${reason})`);
    resetPlaybackRuntime();
    void reportPlaybackStopped(stopped.playback, stopped.positionTicks);
    return stopped.playback;
}

function clearPlaybackState(reason: string): void {
    const playback = getCurrentPlayback();
    if (playback || pendingWindowTitle || shouldResetPlaylistOnNextLoad) {
        logDebug(`Jellyfin: Clearing playback state (${reason})`);
    }
    stopActivePlayback(reason);
    resetPlaybackRuntime();
    clearPlaybackHandoffs();
    pendingWindowTitle = null;
    shouldResetPlaylistOnNextLoad = false;
}

function handleNoNextEpisode(reason: string, options: PlaybackHandlersOptions): void {
    logDebug("Jellyfin: No next episode:", reason);
    try {
        core.open(JELLYFIN_SPLASH_URL);
    } catch (error) {
        console.error(`Jellyfin: Failed to open splash with core.open: ${formatError(error)}`);
    }

    options.showSidebar();
    options.refreshSidebar();
}
