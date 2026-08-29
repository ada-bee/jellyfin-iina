import { describe, expect, test } from "bun:test";

import type { PlaybackHandoff } from "../jellyfin/types";
import { PlaybackController } from "./controller";
import type {
    AutoplayResult,
    Clock,
    PlaybackApi,
    PlaybackLogger,
    PlaybackSession,
    PlaybackView,
    Player,
    PlaylistEntry,
    TrackSelection
} from "./ports";
import type { NormalizedSegment } from "./segments";

const CONFIG = {
    splashUrl: "splash.png",
    ticksPerSecond: 10_000_000,
    resumeSeekDelayMs: 1000,
    progressReportIntervalMs: 10_000,
    playbackTickIntervalMs: 1000,
    eofWatchThresholdSeconds: 0.5,
    skipSegmentPollIntervalMs: 500
};

describe("PlaybackController", () => {
    test("reports a replaced session stopped exactly once", async () => {
        const harness = createHarness();
        const first = handoff("first");
        startPlayback(harness, first);
        harness.player.position = 12;

        harness.controller.play({ playback: handoff("second") });
        harness.controller.onEndFile();
        await settle();

        expect(harness.api.stops).toEqual([{
            playSessionId: "session-first",
            positionTicks: 120_000_000
        }]);
    });

    test("resumes only after the requested handoff becomes active", () => {
        const harness = createHarness();
        const playback = handoff("matching");

        harness.controller.play({ playback, resumeSeconds: 42 });
        expect(harness.player.seeks).toEqual([]);
        harness.player.path = playback.url;
        harness.controller.onFileLoaded();
        expect(harness.player.seeks).toEqual([]);

        harness.clock.runTimeout(CONFIG.resumeSeekDelayMs);
        expect(harness.player.seeks).toEqual([42]);
    });

    test("keeps title and resume metadata with each pending handoff", () => {
        const harness = createHarness();
        const first = handoff("first");
        const second = handoff("second");

        harness.controller.play({ playback: first, title: "First title", resumeSeconds: 11 });
        harness.controller.play({ playback: second, title: "Second title", resumeSeconds: 22 });

        harness.player.path = first.url;
        harness.controller.onFileLoaded();
        harness.clock.runTimeout(CONFIG.resumeSeekDelayMs);
        expect(harness.player.titles).toEqual(["First title"]);
        expect(harness.player.seeks).toEqual([11]);

        harness.player.path = second.url;
        harness.controller.onFileLoaded();
        harness.clock.runTimeout(CONFIG.resumeSeekDelayMs);
        expect(harness.player.titles).toEqual(["First title", "Second title"]);
        expect(harness.player.seeks).toEqual([11, 22]);
    });

    test("ignores stale autoplay and segment responses", async () => {
        const harness = createHarness();
        const staleAutoplay = deferred<AutoplayResult | null>();
        const staleSegments = deferred<NormalizedSegment[]>();
        harness.api.autoplayResults.push(staleAutoplay.promise, Promise.resolve(null));
        harness.api.segmentResults.push(staleSegments.promise, Promise.resolve([]));

        startPlayback(harness, handoff("old", true));
        harness.controller.play({ playback: handoff("new", true) });
        harness.player.path = handoff("new", true).url;
        harness.controller.onFileLoaded();

        staleAutoplay.resolve({
            handoff: handoff("stale-next", true),
            title: "Stale next"
        });
        staleSegments.resolve([{
            type: "Intro",
            startSeconds: 0,
            endSeconds: 20
        }]);
        await settle();
        harness.player.position = 5;
        harness.clock.runInterval(CONFIG.skipSegmentPollIntervalMs);

        expect(harness.player.nextLoads).toEqual([]);
        expect(harness.view.shownSkipLabels).toEqual([]);
    });

    test("lets queued autoplay transition without opening the splash", async () => {
        const harness = createHarness();
        harness.api.autoplayResults.push(Promise.resolve({
            handoff: handoff("next", true),
            title: "Next episode"
        }));
        startPlayback(harness, handoff("episode", true));
        await settle();

        harness.controller.onEndFile();
        await settle();

        expect(harness.player.nextLoads.map((entry) => entry.handoff.itemId)).toEqual(["next"]);
        expect(harness.player.opened).toEqual([]);
        expect(harness.api.stops).toHaveLength(1);
    });

    test("uses the EOF fallback when autoplay has not queued", async () => {
        const harness = createHarness();
        startPlayback(harness, handoff("movie"));
        harness.player.position = 99.8;
        harness.player.duration = 100;
        harness.player.paused = true;

        harness.clock.runInterval(CONFIG.playbackTickIntervalMs);
        await settle();

        expect(harness.player.opened).toEqual([CONFIG.splashUrl]);
        expect(harness.view.showSidebarCount).toBe(1);
        expect(harness.api.stops).toHaveLength(1);
    });

    test("window close stops once, keeps the last useful position, and cancels timers", async () => {
        const harness = createHarness();
        startPlayback(harness, handoff("closing"));
        harness.player.position = 33;
        harness.clock.runInterval(CONFIG.playbackTickIntervalMs);
        harness.player.position = 0;

        harness.controller.onWindowClose();
        harness.controller.onWindowClose();
        await settle();

        expect(harness.api.stops).toEqual([{
            playSessionId: "session-closing",
            positionTicks: 330_000_000
        }]);
        expect(harness.clock.intervals.size).toBe(0);
    });

    test("shows and executes skip actions at the segment boundary", async () => {
        const harness = createHarness();
        harness.api.segmentResults.push(Promise.resolve([{
            type: "Intro",
            startSeconds: 5,
            endSeconds: 20
        }]));
        startPlayback(harness, handoff("episode", true));
        await settle();
        harness.player.position = 8;

        harness.clock.runInterval(CONFIG.skipSegmentPollIntervalMs);
        expect(harness.view.shownSkipLabels).toEqual(["Skip Intro"]);
        harness.view.skipHandler?.();

        expect(harness.player.seeks).toEqual([20.5]);
        expect(harness.view.hideSkipCount).toBe(1);
    });
});

class FakeClock implements Clock {
    readonly intervals = new Map<number, { callback: () => void; delay: number }>();
    readonly timeouts = new Map<number, { callback: () => void; delay: number }>();
    private nextId = 1;

    setInterval(callback: () => void, delay: number): unknown {
        const id = this.nextId++;
        this.intervals.set(id, { callback, delay });
        return id;
    }

    clearInterval(handle: unknown): void {
        this.intervals.delete(Number(handle));
    }

    setTimeout(callback: () => void, delay: number): unknown {
        const id = this.nextId++;
        this.timeouts.set(id, { callback, delay });
        return id;
    }

    clearTimeout(handle: unknown): void {
        this.timeouts.delete(Number(handle));
    }

    runInterval(delay: number): void {
        for (const timer of [...this.intervals.values()]) {
            if (timer.delay === delay) {
                timer.callback();
            }
        }
    }

    runTimeout(delay: number): void {
        for (const [id, timer] of [...this.timeouts.entries()]) {
            if (timer.delay === delay) {
                this.timeouts.delete(id);
                timer.callback();
            }
        }
    }
}

class FakePlayer implements Player {
    path = "";
    position = 0;
    duration = 0;
    paused = false;
    eof = false;
    playlist: PlaylistEntry[] = [{ filename: "current", current: true }];
    selection: TrackSelection = { audioStreamIndex: 1, subtitleStreamIndex: null };
    replacements: PlaybackHandoff[] = [];
    nextLoads: { handoff: PlaybackHandoff; title: string }[] = [];
    removed: number[] = [];
    titles: string[] = [];
    seeks: number[] = [];
    subtitles: string[] = [];
    opened: string[] = [];

    getPath() { return this.path; }
    getPositionSeconds() { return this.position; }
    getDurationSeconds() { return this.duration; }
    isPaused() { return this.paused; }
    isEofReached() { return this.eof; }
    getPlaylist() { return this.playlist; }
    getTrackSelection() { return this.selection; }
    loadReplacement(handoff: PlaybackHandoff) { this.replacements.push(handoff); }
    loadNext(handoff: PlaybackHandoff, title: string) {
        this.nextLoads.push({ handoff, title });
    }
    removePlaylistEntry(index: number) { this.removed.push(index); }
    setWindowTitle(title: string) { this.titles.push(title); }
    seek(seconds: number) { this.seeks.push(seconds); }
    loadExternalSubtitles(playback: PlaybackSession) { this.subtitles.push(playback.itemId); }
    open(url: string) { this.opened.push(url); }
}

class FakeApi implements PlaybackApi {
    readonly starts: string[] = [];
    readonly progress: string[] = [];
    readonly stops: { playSessionId: string; positionTicks: number }[] = [];
    readonly autoplayResults: Promise<AutoplayResult | null>[] = [];
    readonly segmentResults: Promise<NormalizedSegment[]>[] = [];

    async reportStart(playback: PlaybackSession): Promise<void> {
        this.starts.push(playback.playSessionId);
    }
    async reportProgress(playback: PlaybackSession): Promise<void> {
        this.progress.push(playback.playSessionId);
    }
    async reportStopped(playback: PlaybackSession, positionTicks: number): Promise<void> {
        this.stops.push({ playSessionId: playback.playSessionId, positionTicks });
    }
    resolveNextEpisode(): Promise<AutoplayResult | null> {
        return this.autoplayResults.shift() || Promise.resolve(null);
    }
    getSegments(): Promise<NormalizedSegment[]> {
        return this.segmentResults.shift() || Promise.resolve([]);
    }
}

class FakeView implements PlaybackView {
    showSidebarCount = 0;
    hideSidebarCount = 0;
    refreshSidebarCount = 0;
    httpsAlertCount = 0;
    shownSkipLabels: string[] = [];
    hideSkipCount = 0;
    skipHandler: (() => void) | null = null;

    hideSidebar() { this.hideSidebarCount += 1; }
    showSidebar() { this.showSidebarCount += 1; }
    refreshSidebar() { this.refreshSidebarCount += 1; }
    showHttpsAlert() { this.httpsAlertCount += 1; }
    showSkipButton(label: string) { this.shownSkipLabels.push(label); }
    hideSkipButton() { this.hideSkipCount += 1; }
    setSkipHandler(handler: () => void) { this.skipHandler = handler; }
}

function createHarness() {
    const player = new FakePlayer();
    const clock = new FakeClock();
    const api = new FakeApi();
    const view = new FakeView();
    const logger: PlaybackLogger = { debug: () => {}, error: () => {} };
    const controller = new PlaybackController({
        player,
        clock,
        api,
        view,
        logger,
        preferences: {
            autoplayNextEpisodeEnabled: () => true,
            skipSegmentsEnabled: () => true
        },
        config: CONFIG
    });
    return { controller, player, clock, api, view };
}

function startPlayback(
    harness: ReturnType<typeof createHarness>,
    playback: PlaybackHandoff
): void {
    harness.controller.play({ playback });
    harness.player.path = playback.url;
    harness.controller.onFileLoaded();
}

function handoff(id: string, episode = false): PlaybackHandoff {
    return {
        url: `https://media.example.test/${id}.mkv?api_key=secret`,
        itemId: id,
        mediaSourceId: `source-${id}`,
        playSessionId: `session-${id}`,
        accessToken: "secret",
        deviceId: "device",
        serverUrl: "https://media.example.test",
        runtimeTicks: 1_000_000_000,
        playMethod: "DirectPlay",
        externalSubtitles: [],
        userId: "user",
        seriesId: episode ? "series" : undefined,
        seasonId: episode ? "season" : undefined,
        episodeIndex: episode ? 1 : undefined
    };
}

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((resolver) => {
        resolve = resolver;
    });
    return { promise, resolve };
}

async function settle(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
}
