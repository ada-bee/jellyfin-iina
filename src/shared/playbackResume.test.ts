import { describe, expect, test } from "bun:test";

import { PlaybackResumeCoordinator, ResumeTimer } from "./playbackResume";

function createTimer() {
    let callback: (() => void) | null = null;
    const cancelled: unknown[] = [];
    const handle = { id: 1 };
    const timer: ResumeTimer = {
        schedule: (scheduledCallback) => {
            callback = scheduledCallback;
            return handle;
        },
        cancel: (cancelledHandle) => cancelled.push(cancelledHandle)
    };
    return {
        timer,
        cancelled,
        run: () => callback?.()
    };
}

describe("PlaybackResumeCoordinator", () => {
    test("seeks only after the matching session becomes active", () => {
        const fakeTimer = createTimer();
        const coordinator = new PlaybackResumeCoordinator(fakeTimer.timer);
        const seeks: number[] = [];
        coordinator.request("session-1", 42);

        expect(coordinator.activate("session-2", 1000, () => true, (seconds) => seeks.push(seconds)))
            .toBe(false);
        expect(coordinator.activate("session-1", 1000, () => true, (seconds) => seeks.push(seconds)))
            .toBe(true);
        fakeTimer.run();

        expect(seeks).toEqual([42]);
    });

    test("does not seek after playback changes during the delay", () => {
        const fakeTimer = createTimer();
        const coordinator = new PlaybackResumeCoordinator(fakeTimer.timer);
        const seeks: number[] = [];
        coordinator.request("session-1", 42);
        coordinator.activate("session-1", 1000, () => false, (seconds) => seeks.push(seconds));

        fakeTimer.run();

        expect(seeks).toEqual([]);
    });

    test("cancels an armed seek when playback stops", () => {
        const fakeTimer = createTimer();
        const coordinator = new PlaybackResumeCoordinator(fakeTimer.timer);
        coordinator.request("session-1", 42);
        coordinator.activate("session-1", 1000, () => true, () => {});

        coordinator.cancel();

        expect(fakeTimer.cancelled).toEqual([{ id: 1 }]);
    });

    test("a replacement request supersedes the previous request", () => {
        const fakeTimer = createTimer();
        const coordinator = new PlaybackResumeCoordinator(fakeTimer.timer);
        const seeks: number[] = [];
        coordinator.request("session-1", 10);
        coordinator.request("session-2", 20);

        expect(coordinator.activate("session-1", 1000, () => true, (seconds) => seeks.push(seconds)))
            .toBe(false);
        coordinator.activate("session-2", 1000, () => true, (seconds) => seeks.push(seconds));
        fakeTimer.run();

        expect(seeks).toEqual([20]);
    });
});
