import { describe, expect, test } from "bun:test";

import {
    isBackdropPlaybackPaused,
    isJellyfinSidebarOpen,
    shouldShowBackdrop
} from "./backdropEligibility";

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

describe("backdrop playback state", () => {
    test("treats paused video and the non-playing Jellyfin splash as paused", () => {
        expect(isBackdropPlaybackPaused(true, "https://example.test/video.mp4")).toBe(true);
        expect(isBackdropPlaybackPaused(
            false,
            "/Library/Application Support/IINA/Jellyfin.png"
        )).toBe(true);
        expect(isBackdropPlaybackPaused(false, "https://example.test/video.mp4")).toBe(false);
    });
});

describe("backdrop overlay eligibility", () => {
    test("requires paused playback, the Jellyfin sidebar, and the preference", () => {
        expect(shouldShowBackdrop({
            playbackPaused: true,
            jellyfinSidebarOpen: true,
            previewsEnabled: true
        })).toBe(true);

        expect(shouldShowBackdrop({
            playbackPaused: false,
            jellyfinSidebarOpen: true,
            previewsEnabled: true
        })).toBe(false);
        expect(shouldShowBackdrop({
            playbackPaused: true,
            jellyfinSidebarOpen: false,
            previewsEnabled: true
        })).toBe(false);
        expect(shouldShowBackdrop({
            playbackPaused: true,
            jellyfinSidebarOpen: true,
            previewsEnabled: false
        })).toBe(false);
    });
});
