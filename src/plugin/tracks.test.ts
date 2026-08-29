import { describe, expect, test } from "bun:test";

import type { ExternalSubtitleTrack } from "../shared/jellyfin";

import { resolveJellyfinTrackSelection } from "./tracks";

const externalSubtitle: ExternalSubtitleTrack = {
    index: 4,
    url: "https://media.example.test/subtitle.srt?api_key=token",
    title: "English",
    language: "eng",
    isDefault: true,
    isForced: false,
    isHearingImpaired: false
};

describe("Jellyfin track selection", () => {
    test("maps selected internal tracks through their FFmpeg indexes", () => {
        const selection = resolveJellyfinTrackSelection([
            { type: "audio", selected: true, "ff-index": 2 },
            { type: "sub", selected: true, "main-selection": 0, "ff-index": 3 }
        ], [], { audioStreamIndex: 1, subtitleStreamIndex: null });

        expect(selection).toEqual({
            audioStreamIndex: 2,
            subtitleStreamIndex: 3
        });
    });

    test("maps a loaded external subtitle back to its Jellyfin index", () => {
        const selection = resolveJellyfinTrackSelection([
            { type: "audio", selected: true, "ff-index": 2 },
            {
                type: "sub",
                selected: true,
                external: true,
                "main-selection": 0,
                "external-filename": externalSubtitle.url
            }
        ], [externalSubtitle], { audioStreamIndex: 1, subtitleStreamIndex: null });

        expect(selection.subtitleStreamIndex).toBe(4);
    });

    test("reports no subtitle when the user disables subtitles", () => {
        const selection = resolveJellyfinTrackSelection([
            { type: "audio", selected: true, "ff-index": 2 },
            { type: "sub", selected: false, "ff-index": 3 }
        ], [], { audioStreamIndex: 1, subtitleStreamIndex: 3 });

        expect(selection.subtitleStreamIndex).toBeNull();
    });

    test("ignores the secondary subtitle selection", () => {
        const selection = resolveJellyfinTrackSelection([
            { type: "sub", selected: true, "main-selection": 1, "ff-index": 8 }
        ], [], { audioStreamIndex: 1, subtitleStreamIndex: 3 });

        expect(selection.subtitleStreamIndex).toBeNull();
    });

    test("keeps negotiated defaults until mpv exposes its track list", () => {
        const fallback = { audioStreamIndex: 1, subtitleStreamIndex: 3 };

        expect(resolveJellyfinTrackSelection(null, [], fallback)).toEqual(fallback);
        expect(resolveJellyfinTrackSelection([], [], fallback)).toEqual(fallback);
    });
});
