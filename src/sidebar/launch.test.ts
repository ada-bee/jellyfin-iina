import { describe, expect, test } from "bun:test";

import { shouldOpenJellyfinLibrary } from "./launch";

describe("Jellyfin sidebar launch", () => {
    test("uses the current idle player instead of creating another window", () => {
        expect(shouldOpenJellyfinLibrary({
            windowReady: false,
            windowClosed: false,
            windowLoaded: false,
            mediaPath: ""
        })).toBe(true);
    });

    test("waits for an existing window or media load", () => {
        expect(shouldOpenJellyfinLibrary({
            windowReady: false,
            windowClosed: false,
            windowLoaded: true,
            mediaPath: ""
        })).toBe(false);
        expect(shouldOpenJellyfinLibrary({
            windowReady: false,
            windowClosed: false,
            windowLoaded: false,
            mediaPath: "https://example.test/video.mp4"
        })).toBe(false);
    });

    test("reuses a player whose previous window has closed", () => {
        expect(shouldOpenJellyfinLibrary({
            windowReady: false,
            windowClosed: true,
            windowLoaded: true,
            mediaPath: "https://example.test/previous-video.mp4"
        })).toBe(true);
    });
});
