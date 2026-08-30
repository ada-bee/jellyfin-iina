import { describe, expect, test } from "bun:test";

import {
    isJellyfinLibraryHost,
    isJellyfinSidebarOpen,
    resolveBackdropMode
} from "./eligibility";

const LIBRARY_HOST_URL =
    "av://lavfi:color@jellyfin=c=0x202020,fps=1,scale=s=1920x1080,setsar=1";

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

describe("Jellyfin library host", () => {
    test("matches only the configured placeholder", () => {
        expect(isJellyfinLibraryHost(LIBRARY_HOST_URL, LIBRARY_HOST_URL)).toBe(true);
        expect(isJellyfinLibraryHost(
            "https://media.example.test/video.mp4",
            LIBRARY_HOST_URL
        )).toBe(false);
    });
});

describe("backdrop mode", () => {
    const baseState = {
        playbackPaused: false,
        jellyfinPlaybackActive: false,
        mediaPath: "https://example.test/video.mp4",
        libraryHostUrl: LIBRARY_HOST_URL,
        jellyfinSidebarOpen: true,
        previewsEnabled: true
    };

    test("browses only over the configured placeholder", () => {
        expect(resolveBackdropMode({
            ...baseState,
            mediaPath: LIBRARY_HOST_URL
        })).toBe("browse");
        expect(resolveBackdropMode({
            ...baseState,
            mediaPath: "https://media.example.test/video.mp4"
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
            mediaPath: LIBRARY_HOST_URL,
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
