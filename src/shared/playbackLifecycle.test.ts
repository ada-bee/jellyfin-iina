import { describe, expect, test } from "bun:test";

import { PlaybackLifecycle } from "./playbackLifecycle";

describe("PlaybackLifecycle", () => {
    test("stops an active session exactly once", () => {
        const lifecycle = new PlaybackLifecycle<string>();
        lifecycle.start("first");

        expect(lifecycle.stop(120)).toEqual({
            playback: "first",
            positionTicks: 120
        });
        expect(lifecycle.stop(140)).toBeNull();
    });

    test("retains the last useful position when mpv resets to zero", () => {
        const lifecycle = new PlaybackLifecycle<string>();
        lifecycle.start("first");
        lifecycle.updatePosition(250);

        expect(lifecycle.stop(0)?.positionTicks).toBe(250);
    });

    test("allows a new session after the previous session stops", () => {
        const lifecycle = new PlaybackLifecycle<string>();
        lifecycle.start("first");
        lifecycle.stop(100);
        lifecycle.start("second");

        expect(lifecycle.current).toBe("second");
    });

    test("rejects replacing an active session without stopping it", () => {
        const lifecycle = new PlaybackLifecycle<string>();
        lifecycle.start("first");

        expect(() => lifecycle.start("second")).toThrow(
            "Cannot start playback while another session is active."
        );
    });
});
