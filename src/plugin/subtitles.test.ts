import { describe, expect, test } from "bun:test";

import type { ExternalSubtitleTrack } from "../shared/jellyfin";

import { buildSubtitleFlags, orderExternalSubtitleTracks } from "./subtitles";

function makeTrack(index: number, overrides: Partial<ExternalSubtitleTrack> = {}): ExternalSubtitleTrack {
    return {
        index,
        url: `https://media.example.test/subtitle-${index}.srt`,
        title: `Subtitle ${index}`,
        language: "eng",
        isDefault: false,
        isForced: false,
        isHearingImpaired: false,
        ...overrides
    };
}

describe("external subtitle loading", () => {
    test("loads the selected track last", () => {
        const tracks = [makeTrack(2), makeTrack(3), makeTrack(4)];

        expect(orderExternalSubtitleTracks(tracks, 3).map(track => track.index)).toEqual([2, 4, 3]);
    });

    test("keeps alternate tracks unselected", () => {
        expect(buildSubtitleFlags(makeTrack(2))).toBe("auto");
    });

    test("marks the negotiated default and accessibility traits", () => {
        const track = makeTrack(3, {
            isDefault: true,
            isForced: true,
            isHearingImpaired: true
        });

        expect(buildSubtitleFlags(track)).toBe("select+default+forced+hearing-impaired");
    });
});
