import { describe, expect, test } from "bun:test";

import { shouldOpenJellyfinSplash } from "./sidebarLaunch";

describe("Jellyfin sidebar launch", () => {
    test("uses the current idle player instead of creating another window", () => {
        expect(shouldOpenJellyfinSplash({
            windowReady: false,
            windowClosed: false,
            windowLoaded: false,
            mediaPath: ""
        })).toBe(true);
    });

    test("waits for an existing window or media load", () => {
        expect(shouldOpenJellyfinSplash({
            windowReady: false,
            windowClosed: false,
            windowLoaded: true,
            mediaPath: ""
        })).toBe(false);
        expect(shouldOpenJellyfinSplash({
            windowReady: false,
            windowClosed: false,
            windowLoaded: false,
            mediaPath: "https://example.test/video.mp4"
        })).toBe(false);
    });

    test("reuses a player whose previous window has closed", () => {
        expect(shouldOpenJellyfinSplash({
            windowReady: false,
            windowClosed: true,
            windowLoaded: true,
            mediaPath: "https://example.test/previous-video.mp4"
        })).toBe(true);
    });
});
