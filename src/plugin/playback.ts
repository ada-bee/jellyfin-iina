import type { JellyfinPlaybackProgressInfo, JellyfinPlaybackStartInfo, JellyfinPlaybackStopInfo } from "../shared/jellyfin";
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
import { setAmbientBackdropEligibility } from "./mediaOverlay";
import { requestAutoplayNextEpisode, resetPlaylistAfterReplace, shouldRequestAutoplay } from "./autoplay";
import { clearSegmentState, startSegmentPolling } from "./segments";
import { getAuthState, getCurrentPlayback, PlaybackState, setCurrentPlayback } from "./state";
import {
    formatError,
    getUrlOrigin,
    isHttpsUrl,
    logDebug,
    parseEpisodeIndex,
    parseUrlParams,
    redactUrlForLog,
    sanitizeMediaTitle
} from "./utils";

const { console, core, event, mpv } = iina;

let pendingWindowTitle: string | null = null;
let isReplacingPlayback = false;
let shouldResetPlaylistOnNextLoad = false;
let lastKnownPositionTicks = 0;
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
    if (!data || !data.url) {
        return;
    }

    const url = String(data.url);
    if (!isHttpsUrl(url)) {
        options.showHttpsAlert();
        return;
    }

    pendingWindowTitle = data.title ? sanitizeMediaTitle(String(data.title)) : null;
    logDebug("Jellyfin: Playing URL:", redactUrlForLog(url, 80));

    setAmbientBackdropEligibility(false);
    isReplacingPlayback = true;
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

        isReplacingPlayback = false;

        if (url.includes("Jellyfin.png")) {
            logDebug("Jellyfin: Splash loaded, showing sidebar");
            clearPlaybackState("splash loaded");
            setAmbientBackdropEligibility(true);
            options.showSidebar();
            options.refreshSidebar();
            return;
        }

        setAmbientBackdropEligibility(false);
        if (!url.includes("/Videos/") || !url.includes("playSessionId=")) {
            clearPlaybackState("non-Jellyfin file loaded");
            return;
        }

        try {
            const playback = buildPlaybackContextFromUrl(url);
            if (!playback) {
                clearPlaybackState("missing playback metadata");
                return;
            }
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
        if (isReplacingPlayback || playback.autoplayQueued) {
            return;
        }

        logDebug("Jellyfin: Playback ended");
        void reportPlaybackStopped();
        cleanupPlaybackState();
        handleNoNextEpisode("end of playback", options);
    });

    event.on("mpv.pause.changed", () => {
        if (getCurrentPlayback()) {
            updateLastKnownPosition();
            void reportPlaybackProgress(mpv.getFlag("pause"));
        }
    });

    const handleShutdown = (reason: string) => {
        const playback = getCurrentPlayback();
        if (!playback) {
            return;
        }
        logDebug(`Jellyfin: Shutdown detected (${reason}), reporting stop`);
        void reportPlaybackStopped();
        cleanupPlaybackState();
    };

    event.on("iina.window-will-close", () => {
        handleShutdown("window close");
    });

    event.on("iina.application-will-terminate" as `mpv.${string}`, () => {
        handleShutdown("app terminate");
    });
}

function buildPlaybackContextFromUrl(url: string): PlaybackState | null {
    const params = parseUrlParams(url);
    const playSessionId = params["playSessionId"];
    if (!playSessionId) {
        return null;
    }

    const seriesId = params["_jf_seriesId"] || "";
    const episodeIndex = parseEpisodeIndex(params["_jf_episodeIndex"]);
    return {
        itemId: params["_jf_itemId"] || "",
        mediaSourceId: params["mediaSourceId"] || "",
        playSessionId: playSessionId,
        accessToken: params["api_key"] || "",
        deviceId: params["_jf_deviceId"] || "",
        userId: params["_jf_userId"] || "",
        serverUrl: getUrlOrigin(url),
        runtimeTicks: Number.parseInt(params["_jf_runtimeTicks"], 10) || 0,
        seriesId: seriesId,
        seasonId: params["_jf_seasonId"] || "",
        episodeIndex: episodeIndex,
        autoplayQueued: false,
        autoplayRequestId: 0,
        nextItemId: "",
        segments: [],
        isEpisode: Boolean(seriesId || episodeIndex !== null)
    };
}

function startPlaybackSession(playback: PlaybackState, options: PlaybackHandlersOptions): void {
    logDebug("Jellyfin: Detected Jellyfin stream, starting playback reporting");
    clearSegmentState();
    isReplacingPlayback = false;

    setCurrentPlayback(playback);

    lastKnownPositionTicks = 0;
    playbackTickCount = 0;
    startPlaybackTick(options);

    if (pendingWindowTitle) {
        applyWindowTitle(pendingWindowTitle);
        pendingWindowTitle = null;
    }

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
    const playback = getCurrentPlayback();
    if (!playback) {
        return;
    }
    const ticks = getPositionTicks();
    if (ticks > 0) {
        lastKnownPositionTicks = ticks;
    }
}

function resolveHttpContext() {
    const playback = getCurrentPlayback();
    if (!playback) {
        return null;
    }
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
    const httpContext = resolveHttpContext();
    if (!playback || !httpContext) {
        return;
    }
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
            PlayMethod: "DirectStream"
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
    const httpContext = resolveHttpContext();
    if (!playback || !httpContext) {
        return;
    }

    try {
        const body: JellyfinPlaybackProgressInfo = {
            ItemId: playback.itemId,
            MediaSourceId: playback.mediaSourceId,
            PlaySessionId: playback.playSessionId,
            PositionTicks: getPositionTicks(),
            IsPaused: isPaused || false,
            PlayMethod: "DirectStream"
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

async function reportPlaybackStopped(): Promise<void> {
    const playback = getCurrentPlayback();
    const httpContext = resolveHttpContext();
    if (!playback || !httpContext) {
        return;
    }
    const positionTicks = getPositionTicks();
    const resolvedTicks = positionTicks || lastKnownPositionTicks || 0;
    logDebug("Jellyfin: Reporting playback stopped at position:", resolvedTicks / TICKS_PER_SECOND);

    try {
        const body: JellyfinPlaybackStopInfo = {
            ItemId: playback.itemId,
            MediaSourceId: playback.mediaSourceId,
            PlaySessionId: playback.playSessionId,
            PositionTicks: resolvedTicks
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
        if (isReplacingPlayback) {
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
        void reportPlaybackStopped();
        cleanupPlaybackState();
        handleNoNextEpisode("eof tick", options);
    }, PLAYBACK_TICK_INTERVAL_MS);
}

function stopPlaybackTick(): void {
    if (playbackTickTimer) {
        clearInterval(playbackTickTimer);
        playbackTickTimer = null;
    }
}

function cleanupPlaybackState(): void {
    stopPlaybackTick();
    clearSegmentState();
    setCurrentPlayback(null);
    lastKnownPositionTicks = 0;
    playbackTickCount = 0;
}

function clearPlaybackState(reason: string): void {
    const playback = getCurrentPlayback();
    if (playback || pendingWindowTitle || shouldResetPlaylistOnNextLoad) {
        logDebug(`Jellyfin: Clearing playback state (${reason})`);
    }
    cleanupPlaybackState();
    pendingWindowTitle = null;
    shouldResetPlaylistOnNextLoad = false;
    isReplacingPlayback = false;
}

function handleNoNextEpisode(reason: string, options: PlaybackHandlersOptions): void {
    logDebug("Jellyfin: No next episode:", reason);
    isReplacingPlayback = true;
    try {
        core.open(JELLYFIN_SPLASH_URL);
    } catch (error) {
        console.error(`Jellyfin: Failed to open splash with core.open: ${formatError(error)}`);
    }

    options.showSidebar();
    options.refreshSidebar();
}
