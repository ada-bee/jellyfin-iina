import { describe, expect, test } from "bun:test";

import type { ExternalSubtitleTrack } from "../jellyfin/types";

import { resolveJellyfinTrackSelection, resolveMpvTrackIds } from "./tracks";

const externalSubtitle: ExternalSubtitleTrack = {
    index: 4,
    url: "https://media.example.test/subtitle.srt",
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

    test("maps requested Jellyfin streams back to mpv track ids", () => {
        expect(resolveMpvTrackIds([
            { id: 1, type: "audio", "ff-index": 2 },
            { id: 3, type: "sub", external: true, "external-filename": externalSubtitle.url }
        ], [externalSubtitle], {
            audioStreamIndex: 2,
            subtitleStreamIndex: 4
        })).toEqual({
            audioTrackId: 1,
            subtitleTrackId: 3
        });
        expect(resolveMpvTrackIds([], [], { subtitleStreamIndex: null }).subtitleTrackId)
            .toBeNull();
    });

    test("matches downloaded external tracks by local path, ignoring unrelated FFmpeg indexes", () => {
        const subtitle = { ...externalSubtitle, localPath: "/tmp/jellyfin-4.ass" };
        const trackList: import("./tracks").MpvTrackInfo[] = [
            { id: 1, type: "sub", external: true, "ff-index": 4, "external-filename": "/tmp/other.srt" },
            { id: 2, type: "sub", external: true, selected: true, "ff-index": 0,
                "external-filename": subtitle.localPath }
        ];
        expect(resolveMpvTrackIds(trackList, [subtitle], { subtitleStreamIndex: 4 }).subtitleTrackId).toBe(2);
        expect(resolveJellyfinTrackSelection(trackList, [subtitle], {
            audioStreamIndex: null, subtitleStreamIndex: null
        }).subtitleStreamIndex).toBe(4);
        expect(resolveMpvTrackIds(trackList, [subtitle], { subtitleStreamIndex: -1 }).subtitleTrackId).toBeNull();
    });
});
