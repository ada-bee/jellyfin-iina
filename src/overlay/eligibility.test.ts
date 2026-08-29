import { describe, expect, test } from "bun:test";

import {
    isJellyfinSplashPath,
    isJellyfinSidebarOpen,
    resolveBackdropMode
} from "./eligibility";

describe("Jellyfin sidebar visibility", () => {
    test("uses tracked visibility when IINA cannot report plugin sidebars", () => {
        expect(isJellyfinSidebarOpen(null, true)).toBe(true);
        expect(isJellyfinSidebarOpen(null, false)).toBe(false);
        expect(isJellyfinSidebarOpen(undefined, true)).toBe(true);
    });

    test("uses IINA's sidebar name when one is available", () => {
        expect(isJellyfinSidebarOpen("plugin:xyz.brbc.jellyfin", false)).toBe(true);
        expect(isJellyfinSidebarOpen("video", true)).toBe(false);
        expect(isJellyfinSidebarOpen("plugin:another-plugin", true)).toBe(false);
    });
});

describe("Jellyfin splash path", () => {
    const splashPath = "~/Library/Application Support/IINA/plugins/jellyfin/assets/Jellyfin.png";
    const resolvedDevPath = "/Users/adela/Developer/jellyfin-iina/assets/Jellyfin.png";

    test("matches only the configured placeholder", () => {
        expect(isJellyfinSplashPath(
            "/Users/adela/Library/Application Support/IINA/plugins/jellyfin/assets/Jellyfin.png",
            [splashPath, resolvedDevPath]
        )).toBe(true);
        expect(isJellyfinSplashPath(
            "file:///Users/adela/Library/Application%20Support/IINA/plugins/jellyfin/assets/Jellyfin.png",
            [splashPath, resolvedDevPath]
        )).toBe(true);
        expect(isJellyfinSplashPath(resolvedDevPath, [splashPath, resolvedDevPath])).toBe(true);
        expect(isJellyfinSplashPath("/tmp/Jellyfin.png", [splashPath, resolvedDevPath])).toBe(false);
    });
});

describe("backdrop mode", () => {
    const baseState = {
        playbackPaused: false,
        jellyfinPlaybackActive: false,
        mediaPath: "https://example.test/video.mp4",
        splashPaths: ["/plugin/assets/Jellyfin.png"],
        jellyfinSidebarOpen: true,
        previewsEnabled: true
    };

    test("browses only over the configured placeholder", () => {
        expect(resolveBackdropMode({
            ...baseState,
            mediaPath: "/plugin/assets/Jellyfin.png"
        })).toBe("browse");
        expect(resolveBackdropMode({
            ...baseState,
            mediaPath: "/tmp/Jellyfin.png"
        })).toBe("hidden");
    });

    test("pauses only for active Jellyfin playback", () => {
        expect(resolveBackdropMode({
            ...baseState,
            playbackPaused: true,
            jellyfinPlaybackActive: true
        })).toBe("paused");
        expect(resolveBackdropMode({
            ...baseState,
            playbackPaused: true
        })).toBe("hidden");
    });

    test("requires the Jellyfin sidebar and preference", () => {
        expect(resolveBackdropMode({
            ...baseState,
            mediaPath: "/plugin/assets/Jellyfin.png",
            jellyfinSidebarOpen: false
        })).toBe("hidden");
        expect(resolveBackdropMode({
            ...baseState,
            playbackPaused: true,
            jellyfinPlaybackActive: true,
            jellyfinSidebarOpen: true,
            previewsEnabled: false
        })).toBe("hidden");
    });
});
