import { IinaClock } from "./clock";
import { IinaPlayer } from "./player";
import { IinaPlaybackPreferences } from "./preferences";
import { PlaybackController } from "../../playback/controller";
import type { PlaybackLogger, PlaybackView } from "../../playback/ports";

import {
    AUTOPLAY_NEXT_PREF_KEY,
    EOF_WATCH_THRESHOLD_SECONDS,
    PLAYBACK_TICK_INTERVAL_MS,
    PROGRESS_REPORT_INTERVAL_MS,
    RESUME_SEEK_DELAY_MS,
    resolveJellyfinSplashUrl,
    SKIP_SEGMENT_POLL_INTERVAL_MS,
    SKIP_SEGMENT_PREF_KEY,
    TICKS_PER_SECOND
} from "./constants";
import { hideSkipButton, setSkipSegmentHandler, showSkipButton } from "./mediaOverlay";
import { IinaPlaybackApi } from "./playbackApi";
import { logDebug } from "./utils";

export interface PlaybackHandlersOptions {
    hideSidebar: () => void;
    showSidebar: () => void;
    refreshSidebar: () => void;
    showHttpsAlert: () => void;
}

export function initializePlaybackHandlers(
    options: PlaybackHandlersOptions
): PlaybackController {
    const logger: PlaybackLogger = {
        debug: (...values) => logDebug(...values),
        error: (message) => iina.console.error(message)
    };
    const view: PlaybackView = {
        hideSidebar: options.hideSidebar,
        showSidebar: options.showSidebar,
        refreshSidebar: options.refreshSidebar,
        showHttpsAlert: options.showHttpsAlert,
        showSkipButton,
        hideSkipButton,
        setSkipHandler: setSkipSegmentHandler
    };
    const controller = new PlaybackController({
        player: new IinaPlayer(logger),
        clock: new IinaClock(),
        preferences: new IinaPlaybackPreferences(
            AUTOPLAY_NEXT_PREF_KEY,
            SKIP_SEGMENT_PREF_KEY
        ),
        api: new IinaPlaybackApi(),
        view,
        logger,
        config: {
            splashUrl: resolveJellyfinSplashUrl(path => iina.file.exists(path)),
            ticksPerSecond: TICKS_PER_SECOND,
            resumeSeekDelayMs: RESUME_SEEK_DELAY_MS,
            progressReportIntervalMs: PROGRESS_REPORT_INTERVAL_MS,
            playbackTickIntervalMs: PLAYBACK_TICK_INTERVAL_MS,
            eofWatchThresholdSeconds: EOF_WATCH_THRESHOLD_SECONDS,
            skipSegmentPollIntervalMs: SKIP_SEGMENT_POLL_INTERVAL_MS
        }
    });

    iina.event.on("mpv.file-loaded", () => controller.onFileLoaded());
    iina.event.on("mpv.end-file", () => controller.onEndFile());
    iina.event.on("mpv.pause.changed", () => controller.onPauseChanged());
    iina.event.on("mpv.aid.changed", () => controller.onTrackChanged());
    iina.event.on("mpv.sid.changed", () => controller.onTrackChanged());
    iina.event.on("iina.window-will-close", () => controller.onWindowClose());

    return controller;
}
