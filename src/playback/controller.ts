import type { PlaybackHandoff } from "../jellyfin/types";
import type { NormalizedSegment } from "./segments";

import { getActiveSegment, shouldShowSkipOverlay } from "./segments";
import { isHttpsUrl } from "../jellyfin/url";
import type {
    PlaybackControllerDependencies,
    PlaybackRequest,
    PlaybackSession,
    PlaylistEntry
} from "./ports";

interface ActivePlayback {
    session: PlaybackSession;
    lastKnownPositionTicks: number;
    reportingStarted: boolean;
    autoplayQueued: boolean;
    nextItemId: string;
    segments: NormalizedSegment[];
}

interface PendingPlayback {
    handoff: PlaybackHandoff;
    title: string;
    resumeSeconds: number;
    resetPlaylist: boolean;
}

interface PlaybackModel {
    active: ActivePlayback | null;
    handoffs: Map<string, PendingPlayback>;
    resumeTimer: unknown | null;
    playbackTimer: unknown | null;
    playbackTickCount: number;
    segmentTimer: unknown | null;
    skipEnabled: boolean;
    skipVisible: boolean;
    skipLabel: string;
    activeSkipSegment: NormalizedSegment | null;
}

export class PlaybackController {
    private readonly model: PlaybackModel = {
        active: null,
        handoffs: new Map(),
        resumeTimer: null,
        playbackTimer: null,
        playbackTickCount: 0,
        segmentTimer: null,
        skipEnabled: true,
        skipVisible: false,
        skipLabel: "",
        activeSkipSegment: null
    };

    constructor(private readonly dependencies: PlaybackControllerDependencies) {
        dependencies.view.setSkipHandler(() => this.skipActiveSegment());
    }

    play(request: PlaybackRequest): void {
        const handoff = request?.playback;
        if (!handoff?.url) {
            return;
        }
        if (!isHttpsUrl(handoff.url) || !isHttpsUrl(handoff.serverUrl)) {
            this.dependencies.view.showHttpsAlert();
            return;
        }

        this.model.handoffs.set(handoff.url, {
            handoff,
            title: request.title || "",
            resumeSeconds: request.resumeSeconds || 0,
            resetPlaylist: true
        });
        this.dependencies.logger.debug("Jellyfin: Playing requested stream");

        this.stopActivePlayback("replacement requested");
        this.dependencies.player.loadReplacement(handoff, request.title || "");
        this.dependencies.view.hideSidebar();
    }

    onFileLoaded(): void {
        const path = this.dependencies.player.getPath();
        if (!path) {
            return;
        }

        if (path.includes("Jellyfin.png")) {
            this.dependencies.logger.debug("Jellyfin: Splash loaded, showing sidebar");
            this.clearPlaybackState("splash loaded");
            this.dependencies.view.showSidebar();
            this.dependencies.view.refreshSidebar();
            return;
        }

        const pending = this.takeHandoff(path);
        if (!pending) {
            this.clearPlaybackState("non-Jellyfin file loaded");
            return;
        }

        try {
            const playback = buildPlaybackSession(pending.handoff);
            if (!isHttpsUrl(playback.serverUrl)) {
                this.dependencies.logger.error("Jellyfin: Skipping HTTP playback reporting");
                this.clearPlaybackState("invalid Jellyfin server URL");
                return;
            }
            this.startPlaybackSession(playback, pending);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.dependencies.logger.debug("Jellyfin: Playback setup error:", message);
            this.clearPlaybackState("invalid Jellyfin handoff");
        }
    }

    onEndFile(): void {
        const active = this.model.active;
        if (!active) {
            return;
        }

        this.dependencies.logger.debug("Jellyfin: Playback ended");
        const autoplayQueued = active.autoplayQueued;
        this.stopActivePlayback("end of playback");
        if (!autoplayQueued) {
            this.handleNoNextEpisode("end of playback");
        }
    }

    onPauseChanged(): void {
        if (!this.model.active) {
            return;
        }
        this.updateLastKnownPosition();
        void this.reportProgress();
    }

    onTrackChanged(): void {
        const active = this.model.active;
        if (!active) {
            return;
        }
        this.syncTrackSelection(active);
        if (active.reportingStarted) {
            void this.reportProgress();
        }
    }

    onWindowClose(): void {
        this.clearPlaybackState("window close");
    }

    private startPlaybackSession(session: PlaybackSession, pending: PendingPlayback): void {
        this.dependencies.logger.debug(
            "Jellyfin: Detected Jellyfin stream, starting playback reporting"
        );
        this.stopActivePlayback("new Jellyfin file loaded");
        this.stopSegmentRuntime();

        const active: ActivePlayback = {
            session,
            lastKnownPositionTicks: 0,
            reportingStarted: false,
            autoplayQueued: false,
            nextItemId: "",
            segments: []
        };
        this.model.active = active;
        this.activateResume(active, pending.resumeSeconds);
        this.startPlaybackTick();

        if (pending.title) {
            this.dependencies.player.setWindowTitle(pending.title);
        }

        this.dependencies.player.loadExternalSubtitles(session);
        active.reportingStarted = true;
        void this.reportStart(active);
        this.startSegmentPolling(active);

        if (pending.resetPlaylist) {
            this.prunePlaylistToCurrentEntry();
        }

        if (session.isEpisode && this.dependencies.preferences.autoplayNextEpisodeEnabled()) {
            void this.requestAutoplay(active);
        }
    }

    private async reportStart(active: ActivePlayback): Promise<void> {
        this.syncTrackSelection(active);
        this.dependencies.logger.debug("Jellyfin: Reporting playback start");
        try {
            await this.dependencies.api.reportStart(active.session, this.getPositionTicks());
        } catch (error) {
            this.logFailure("report playback start", error);
        }
    }

    private async reportProgress(): Promise<void> {
        const active = this.model.active;
        if (!active) {
            return;
        }
        this.syncTrackSelection(active);
        try {
            await this.dependencies.api.reportProgress(
                active.session,
                this.getPositionTicks(),
                this.dependencies.player.isPaused()
            );
        } catch (error) {
            this.logFailure("report playback progress", error);
        }
    }

    private async reportStopped(active: ActivePlayback, positionTicks: number): Promise<void> {
        this.dependencies.logger.debug(
            "Jellyfin: Reporting playback stopped at position:",
            positionTicks / this.dependencies.config.ticksPerSecond
        );
        try {
            await this.dependencies.api.reportStopped(active.session, positionTicks);
        } catch (error) {
            this.logFailure("report playback stopped", error);
        }
    }

    private startPlaybackTick(): void {
        this.stopPlaybackTick();
        this.model.playbackTimer = this.dependencies.clock.setInterval(
            () => this.onPlaybackTick(),
            this.dependencies.config.playbackTickIntervalMs
        );
    }

    private onPlaybackTick(): void {
        const active = this.model.active;
        if (!active) {
            return;
        }
        this.updateLastKnownPosition();
        this.model.playbackTickCount += 1;

        const reportEvery = Math.max(
            1,
            this.dependencies.config.progressReportIntervalMs
                / this.dependencies.config.playbackTickIntervalMs
        );
        if (this.model.playbackTickCount >= reportEvery) {
            this.model.playbackTickCount = 0;
            void this.reportProgress();
        }
        if (active.autoplayQueued) {
            return;
        }

        const duration = this.dependencies.player.getDurationSeconds();
        const position = this.dependencies.player.getPositionSeconds();
        if (!duration || duration <= 0 || !Number.isFinite(position)) {
            return;
        }
        if (duration - position > this.dependencies.config.eofWatchThresholdSeconds) {
            return;
        }
        if (!this.dependencies.player.isPaused() && !this.dependencies.player.isEofReached()) {
            return;
        }

        this.dependencies.logger.debug("Jellyfin: Playback reached EOF (tick)");
        this.stopActivePlayback("EOF tick");
        this.handleNoNextEpisode("eof tick");
    }

    private stopPlaybackTick(): void {
        if (this.model.playbackTimer === null) {
            return;
        }
        this.dependencies.clock.clearInterval(this.model.playbackTimer);
        this.model.playbackTimer = null;
    }

    private stopActivePlayback(reason: string): ActivePlayback | null {
        const active = this.model.active;
        if (!active) {
            return null;
        }

        const currentPosition = this.getPositionTicks();
        if (currentPosition > 0) {
            active.lastKnownPositionTicks = currentPosition;
        }
        const positionTicks = currentPosition || active.lastKnownPositionTicks || 0;
        this.model.active = null;
        this.dependencies.logger.debug(`Jellyfin: Stopping playback (${reason})`);
        this.cancelResume();
        this.resetPlaybackRuntime();
        void this.reportStopped(active, positionTicks);
        return active;
    }

    private clearPlaybackState(reason: string): void {
        if (
            this.model.active
            || this.model.handoffs.size > 0
        ) {
            this.dependencies.logger.debug(`Jellyfin: Clearing playback state (${reason})`);
        }
        this.stopActivePlayback(reason);
        this.cancelResume();
        this.resetPlaybackRuntime();
        this.model.handoffs.clear();
    }

    private resetPlaybackRuntime(): void {
        this.stopPlaybackTick();
        this.stopSegmentRuntime();
        this.model.playbackTickCount = 0;
    }

    private updateLastKnownPosition(): void {
        const active = this.model.active;
        const positionTicks = this.getPositionTicks();
        if (active && positionTicks > 0) {
            active.lastKnownPositionTicks = positionTicks;
        }
    }

    private getPositionTicks(): number {
        return Math.floor(
            (this.dependencies.player.getPositionSeconds() || 0)
            * this.dependencies.config.ticksPerSecond
        );
    }

    private activateResume(active: ActivePlayback, seconds: number): void {
        this.cancelResume();
        if (!Number.isFinite(seconds) || seconds <= 0) {
            return;
        }
        this.model.resumeTimer = this.dependencies.clock.setTimeout(() => {
            this.model.resumeTimer = null;
            if (this.model.active === active) {
                this.dependencies.player.seek(seconds);
            }
        }, this.dependencies.config.resumeSeekDelayMs);
        this.dependencies.logger.debug("Jellyfin: Will resume matching session after file load");
    }

    private cancelResume(): void {
        if (this.model.resumeTimer !== null) {
            this.dependencies.clock.clearTimeout(this.model.resumeTimer);
            this.model.resumeTimer = null;
        }
    }

    private async requestAutoplay(active: ActivePlayback): Promise<void> {
        active.autoplayQueued = false;
        try {
            const result = await this.dependencies.api.resolveNextEpisode(active.session);
            if (this.model.active !== active) {
                return;
            }
            active.nextItemId = result?.handoff.itemId || "";
            if (result) {
                this.queueNextEpisode(active, result.handoff, result.title);
            }
        } catch (error) {
            if (this.model.active === active) {
                active.nextItemId = "";
                active.autoplayQueued = false;
            }
            this.logFailure("autoplay lookup", error);
        }
    }

    private queueNextEpisode(
        active: ActivePlayback,
        handoff: PlaybackHandoff,
        title: string
    ): void {
        try {
            const playlist = this.dependencies.player.getPlaylist();
            const currentIndex = findCurrentPlaylistIndex(playlist);
            if (currentIndex !== -1) {
                const nextUrl = playlist[currentIndex + 1]?.filename || "";
                const nextItemId = this.model.handoffs.get(nextUrl)?.handoff.itemId || "";
                if (nextItemId && nextItemId === active.nextItemId) {
                    active.autoplayQueued = true;
                    return;
                }
                for (let index = playlist.length - 1; index > currentIndex; index -= 1) {
                    this.dependencies.player.removePlaylistEntry(index);
                }
            }

            this.model.handoffs.set(handoff.url, {
                handoff,
                title,
                resumeSeconds: 0,
                resetPlaylist: false
            });
            this.dependencies.player.loadNext(handoff, title);
            active.autoplayQueued = true;
            this.dependencies.logger.debug("Jellyfin: Queued next episode");
        } catch (error) {
            this.logFailure("queue next episode", error);
        }
    }

    private prunePlaylistToCurrentEntry(): void {
        const playlist = this.dependencies.player.getPlaylist();
        const currentIndex = findCurrentPlaylistIndex(playlist);
        if (currentIndex === -1) {
            return;
        }
        for (let index = playlist.length - 1; index >= 0; index -= 1) {
            if (index !== currentIndex) {
                this.dependencies.player.removePlaylistEntry(index);
            }
        }
    }

    private startSegmentPolling(active: ActivePlayback): void {
        this.stopSegmentRuntime();
        this.model.skipEnabled = this.dependencies.preferences.skipSegmentsEnabled();
        if (this.model.skipEnabled) {
            void this.requestSegments(active);
        }
        this.model.segmentTimer = this.dependencies.clock.setInterval(
            () => this.onSegmentTick(active),
            this.dependencies.config.skipSegmentPollIntervalMs
        );
    }

    private onSegmentTick(active: ActivePlayback): void {
        if (this.model.active !== active) {
            return;
        }
        this.refreshSkipPreference(active);
        if (!this.model.skipEnabled) {
            this.hideSkipOverlay();
            return;
        }

        const segment = getActiveSegment(
            this.dependencies.player.getPositionSeconds(),
            active.segments
        );
        if (!shouldShowSkipOverlay(segment)) {
            this.hideSkipOverlay();
            return;
        }
        this.model.activeSkipSegment = segment;
        this.showSkipOverlay(getSkipLabel(segment));
    }

    private refreshSkipPreference(active: ActivePlayback): void {
        const enabled = this.dependencies.preferences.skipSegmentsEnabled();
        if (enabled === this.model.skipEnabled) {
            return;
        }
        this.model.skipEnabled = enabled;
        if (!enabled) {
            this.hideSkipOverlay();
        } else {
            void this.requestSegments(active);
        }
    }

    private async requestSegments(active: ActivePlayback): Promise<void> {
        if (!active.session.isEpisode) {
            active.segments = [];
            return;
        }
        try {
            const segments = await this.dependencies.api.getSegments(active.session);
            if (this.model.active === active) {
                active.segments = resolveSegmentDuration(
                    segments,
                    this.dependencies.player.getDurationSeconds()
                );
            }
        } catch (error) {
            if (this.model.active === active) {
                active.segments = [];
            }
            this.logFailure("fetch media segments", error);
        }
    }

    private stopSegmentRuntime(): void {
        if (this.model.segmentTimer !== null) {
            this.dependencies.clock.clearInterval(this.model.segmentTimer);
            this.model.segmentTimer = null;
        }
        this.hideSkipOverlay();
        this.model.activeSkipSegment = null;
        if (this.model.active) {
            this.model.active.segments = [];
        }
    }

    private skipActiveSegment(): void {
        const target = this.model.activeSkipSegment?.endSeconds;
        if (typeof target === "number" && target > 0) {
            this.dependencies.player.seek(Math.max(0, target + 0.5));
        }
        this.hideSkipOverlay();
    }

    private showSkipOverlay(label: string): void {
        if (this.model.skipVisible && label === this.model.skipLabel) {
            return;
        }
        this.model.skipLabel = label;
        this.dependencies.view.showSkipButton(label);
        this.model.skipVisible = true;
    }

    private hideSkipOverlay(): void {
        if (!this.model.skipVisible) {
            this.model.activeSkipSegment = null;
            return;
        }
        this.dependencies.view.hideSkipButton();
        this.model.skipVisible = false;
        this.model.skipLabel = "";
        this.model.activeSkipSegment = null;
    }

    private syncTrackSelection(active: ActivePlayback): void {
        const selection = this.dependencies.player.getTrackSelection(active.session);
        active.session.audioStreamIndex = selection.audioStreamIndex;
        active.session.subtitleStreamIndex = selection.subtitleStreamIndex;
    }

    private takeHandoff(url: string): PendingPlayback | null {
        const pending = this.model.handoffs.get(url) || null;
        if (pending) {
            this.model.handoffs.delete(url);
        }
        return pending;
    }

    private handleNoNextEpisode(reason: string): void {
        this.dependencies.logger.debug("Jellyfin: No next episode:", reason);
        try {
            this.dependencies.player.open(this.dependencies.config.splashUrl);
        } catch (error) {
            this.logFailure("open splash", error);
        }
        this.dependencies.view.showSidebar();
        this.dependencies.view.refreshSidebar();
    }

    private logFailure(action: string, error: unknown): void {
        const message = error instanceof Error ? error.message : String(error);
        this.dependencies.logger.error(`Jellyfin: Failed to ${action}: ${message}`);
    }
}

function buildPlaybackSession(handoff: PlaybackHandoff): PlaybackSession {
    const { url: _url, ...context } = handoff;
    return {
        ...context,
        isEpisode: Boolean(
            context.seriesId
            || (context.episodeIndex !== null && context.episodeIndex !== undefined)
        )
    };
}

function findCurrentPlaylistIndex(playlist: PlaylistEntry[]): number {
    return playlist.findIndex((entry) => Boolean(entry && (entry.current || entry.playing)));
}

function getSkipLabel(segment: NormalizedSegment | null): string {
    if (segment?.type === "Intro") {
        return "Skip Intro";
    }
    if (segment?.type === "Outro") {
        return "Skip Credits";
    }
    return "Skip";
}

function resolveSegmentDuration(
    segments: NormalizedSegment[],
    durationSeconds: number
): NormalizedSegment[] {
    if (!durationSeconds || durationSeconds <= 0) {
        return segments;
    }
    return segments.map((segment) => (
        segment.type === "Outro" && segment.endSeconds === null
            ? { ...segment, endSeconds: durationSeconds }
            : segment
    ));
}
