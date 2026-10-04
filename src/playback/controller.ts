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
    url: string;
    session: PlaybackSession;
    lastKnownPositionTicks: number;
    reportingStarted: boolean;
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
    requestedUrl: string;
    loadingUrl: string;
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
        requestedUrl: "",
        loadingUrl: "",
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
        const handoff = this.validateRequest(request);
        if (!handoff) {
            return;
        }

        this.registerPendingHandoff(request, true);
        this.model.requestedUrl = handoff.url;
        this.model.loadingUrl = "";
        this.dependencies.logger.debug("Jellyfin: Playing requested stream");

        this.stopActivePlayback("replacement requested");
        this.dependencies.player.clearExternalSubtitles();
        try {
            this.dependencies.player.loadReplacement(handoff, request.title || "");
            this.dependencies.view.hideSidebar();
        } catch (error) {
            this.logFailure("load playback", error);
            this.clearPlaybackState("playback command failed");
            this.handleNoNextEpisode("playback command failed");
        }
    }

    queue(request: PlaybackRequest): void {
        const handoff = this.validateRequest(request);
        if (!handoff) {
            return;
        }

        this.registerPendingHandoff(request, false);
        this.dependencies.player.loadAppend(handoff, request.title || "");
        this.dependencies.logger.debug("Jellyfin: Queued requested stream");
    }

    openLibrary(): boolean {
        try {
            this.dependencies.player.setWindowTitle(this.dependencies.config.libraryTitle);
            this.dependencies.player.open(this.dependencies.config.libraryHostUrl);
            return true;
        } catch (error) {
            this.logFailure("open library", error);
            return false;
        }
    }

    onStartFile(path = this.dependencies.player.getPath()): void {
        this.dependencies.player.clearExternalSubtitles();
        this.model.loadingUrl = this.model.handoffs.has(path) ? path : "";
        this.prunePendingHandoffs();
    }

    onFileLoaded(): void {
        const path = this.dependencies.player.getPath();
        if (!path) {
            return;
        }
        this.model.loadingUrl = "";
        if (this.model.requestedUrl === path) {
            this.model.requestedUrl = "";
        }

        if (this.dependencies.config.isLibraryHost(path)) {
            this.dependencies.logger.debug("Jellyfin: Library host loaded, showing sidebar");
            this.dependencies.player.setWindowTitle(this.dependencies.config.libraryTitle);
            this.clearPlaybackState("library host loaded");
            this.pauseLibraryHost();
            this.dependencies.view.showSidebar();
            this.dependencies.view.refreshSidebar();
            return;
        }

        const pending = this.takeHandoff(path);
        if (!pending) {
            this.stopActivePlayback("non-Jellyfin file loaded");
            this.prunePendingHandoffs();
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
        const loadingUrl = this.model.loadingUrl;
        this.model.loadingUrl = "";
        if (!active) {
            this.handleLoadFailure(loadingUrl);
            return;
        }

        this.dependencies.logger.debug("Jellyfin: Playback ended");
        this.stopActivePlayback("end of playback");
        if (!this.hasQueuedPlayback(active.url)) {
            this.handleNoNextEpisode("end of playback");
        }
    }

    private handleLoadFailure(url: string): void {
        if (!url || (this.model.requestedUrl && this.model.requestedUrl !== url)) {
            return;
        }
        this.model.requestedUrl = "";
        if (!this.hasQueuedPlayback(url)) {
            this.handleNoNextEpisode("stream failed before file load");
        }
    }

    onPauseChanged(): void {
        if (this.dependencies.config.isLibraryHost(this.dependencies.player.getPath())) {
            this.pauseLibraryHost();
            return;
        }
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

    onAuthCleared(): void {
        const hasPlayback = Boolean(this.model.active || this.model.loadingUrl || this.model.requestedUrl);
        const playlist = this.dependencies.player.getPlaylist();
        const jellyfinUrls = new Set(this.model.handoffs.keys());
        this.clearPlaybackState("authentication cleared");
        for (let index = playlist.length - 1; index >= 0; index -= 1) {
            if (jellyfinUrls.has(playlist[index].filename)) {
                this.dependencies.player.removePlaylistEntry(index);
            }
        }
        if (hasPlayback) {
            this.handleNoNextEpisode("authentication cleared");
        }
    }

    private pauseLibraryHost(): void {
        if (this.dependencies.player.isPaused()) {
            return;
        }
        this.dependencies.logger.debug("Jellyfin: Pausing library host");
        this.dependencies.player.pause();
    }

    private validateRequest(request: PlaybackRequest): PlaybackHandoff | null {
        const handoff = request?.playback;
        if (!handoff?.url) {
            return null;
        }
        if (!isHttpsUrl(handoff.url) || !isHttpsUrl(handoff.serverUrl)) {
            this.dependencies.view.showHttpsAlert();
            return null;
        }
        return handoff;
    }

    private registerPendingHandoff(request: PlaybackRequest, resetPlaylist: boolean): void {
        this.model.handoffs.set(request.playback.url, {
            handoff: request.playback,
            title: request.title || "",
            resumeSeconds: request.resumeSeconds || 0,
            resetPlaylist
        });
    }

    private startPlaybackSession(session: PlaybackSession, pending: PendingPlayback): void {
        this.dependencies.logger.debug(
            "Jellyfin: Detected Jellyfin stream, starting playback reporting"
        );
        this.stopActivePlayback("new Jellyfin file loaded");
        this.stopSegmentRuntime();

        const active: ActivePlayback = {
            url: pending.handoff.url,
            session,
            lastKnownPositionTicks: 0,
            reportingStarted: false,
            segments: []
        };
        this.model.active = active;
        this.dependencies.view.setActiveBackdropItem(session.seriesId || session.itemId);
        this.activateResume(active, pending.resumeSeconds);
        this.startPlaybackTick();

        if (pending.title) {
            this.dependencies.player.setWindowTitle(pending.title);
        }

        this.dependencies.player.loadExternalSubtitles(session);
        this.dependencies.player.applyTrackSelection(session);
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
        if (this.hasQueuedPlayback(active.url)) {
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
        this.dependencies.player.clearExternalSubtitles();
        this.dependencies.view.clearActiveBackdropItem();
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
        this.model.requestedUrl = "";
        this.model.loadingUrl = "";
        this.dependencies.player.clearExternalSubtitles();
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
        try {
            const result = await this.dependencies.api.resolveNextEpisode(active.session);
            if (this.model.active !== active) {
                return;
            }
            if (result) {
                this.queueNextEpisode(result.handoff, result.title);
            }
        } catch (error) {
            this.logFailure("autoplay lookup", error);
        }
    }

    private queueNextEpisode(
        handoff: PlaybackHandoff,
        title: string
    ): void {
        try {
            const playlist = this.dependencies.player.getPlaylist();
            const currentIndex = findCurrentPlaylistIndex(playlist);
            if (currentIndex !== -1) {
                const nextUrl = playlist[currentIndex + 1]?.filename || "";
                const nextItemId = this.model.handoffs.get(nextUrl)?.handoff.itemId || "";
                if (nextItemId && nextItemId === handoff.itemId) {
                    return;
                }
            }

            this.model.handoffs.set(handoff.url, {
                handoff,
                title,
                resumeSeconds: 0,
                resetPlaylist: false
            });
            this.dependencies.player.loadNext(handoff, title);
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
            // Native playlist replays need the context, but resume and playlist reset apply only once.
            this.model.handoffs.set(url, { ...pending, resumeSeconds: 0, resetPlaylist: false });
        }
        return pending;
    }

    private prunePendingHandoffs(): void {
        const queuedUrls = new Set(
            this.dependencies.player.getPlaylist().map(entry => entry.filename)
        );
        for (const url of this.model.handoffs.keys()) {
            if (!queuedUrls.has(url) && url !== this.model.requestedUrl) {
                this.model.handoffs.delete(url);
            }
        }
    }

    private hasQueuedPlayback(endedUrl: string): boolean {
        const playlist = this.dependencies.player.getPlaylist();
        const endedIndex = playlist.findIndex(entry => entry.filename === endedUrl);
        const currentIndex = findCurrentPlaylistIndex(playlist);
        if (currentIndex !== -1 && currentIndex !== endedIndex) {
            return true;
        }
        return endedIndex !== -1
            && playlist.slice(endedIndex + 1).some(entry => Boolean(entry.filename));
    }

    private handleNoNextEpisode(reason: string): void {
        this.dependencies.logger.debug("Jellyfin: No next episode:", reason);
        this.openLibrary();
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
