import type { PlaybackContext, PlaybackHandoff } from "../jellyfin/types";
import type { PlayItemPayload } from "../jellyfin/messages";
import type { NormalizedSegment } from "./segments";

export interface PlaybackSession extends PlaybackContext {
    isEpisode: boolean;
}

export interface TrackSelection {
    audioStreamIndex: number | null;
    subtitleStreamIndex: number | null;
}

export interface PlaylistEntry {
    filename: string;
    current?: boolean;
    playing?: boolean;
}

export interface AutoplayResult {
    handoff: PlaybackHandoff;
    title: string;
}

export interface Player {
    getPath(): string;
    getPositionSeconds(): number;
    getDurationSeconds(): number;
    isPaused(): boolean;
    isEofReached(): boolean;
    getPlaylist(): PlaylistEntry[];
    getTrackSelection(playback: PlaybackSession): TrackSelection;
    loadReplacement(handoff: PlaybackHandoff, title: string): void;
    loadNext(handoff: PlaybackHandoff, title: string): void;
    removePlaylistEntry(index: number): void;
    setWindowTitle(title: string): void;
    seek(seconds: number): void;
    loadExternalSubtitles(playback: PlaybackSession): void;
    open(url: string): void;
}

export interface Clock {
    setInterval(callback: () => void, intervalMs: number): unknown;
    clearInterval(handle: unknown): void;
    setTimeout(callback: () => void, delayMs: number): unknown;
    clearTimeout(handle: unknown): void;
}

export interface PlaybackPreferences {
    autoplayNextEpisodeEnabled(): boolean;
    skipSegmentsEnabled(): boolean;
}

export interface PlaybackApi {
    reportStart(playback: PlaybackSession, positionTicks: number): Promise<void>;
    reportProgress(
        playback: PlaybackSession,
        positionTicks: number,
        isPaused: boolean
    ): Promise<void>;
    reportStopped(playback: PlaybackSession, positionTicks: number): Promise<void>;
    resolveNextEpisode(playback: PlaybackSession): Promise<AutoplayResult | null>;
    getSegments(playback: PlaybackSession): Promise<NormalizedSegment[]>;
}

export interface PlaybackView {
    hideSidebar(): void;
    showSidebar(): void;
    refreshSidebar(): void;
    showHttpsAlert(): void;
    showSkipButton(label: string): void;
    hideSkipButton(): void;
    setSkipHandler(handler: () => void): void;
}

export interface PlaybackLogger {
    debug(...values: unknown[]): void;
    error(message: string): void;
}

export interface PlaybackControllerConfig {
    splashUrl: string;
    ticksPerSecond: number;
    resumeSeekDelayMs: number;
    progressReportIntervalMs: number;
    playbackTickIntervalMs: number;
    eofWatchThresholdSeconds: number;
    skipSegmentPollIntervalMs: number;
}

export interface PlaybackControllerDependencies {
    player: Player;
    clock: Clock;
    preferences: PlaybackPreferences;
    api: PlaybackApi;
    view: PlaybackView;
    logger: PlaybackLogger;
    config: PlaybackControllerConfig;
}

export type PlaybackRequest = PlayItemPayload;
