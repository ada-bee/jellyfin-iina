import { describe, expect, test } from "bun:test";

import type { JellyfinBaseItem } from "../jellyfin/types";

import {
    getDetailPlaybackLabel,
    selectCardArtwork,
    selectCardFallbackArtwork
} from "./artwork";

const episode: JellyfinBaseItem = {
    Id: "episode",
    Type: "Episode",
    SeriesId: "series"
};

describe("sidebar artwork policy", () => {
    test("selects card artwork without depending on DOM or session state", () => {
        expect(selectCardArtwork(episode, { usePosterImage: true })).toEqual({
            itemId: "series",
            imageType: "Primary",
            maxWidth: 420
        });
        expect(selectCardArtwork(episode, { useEpisodeThumbnail: true })).toEqual({
            itemId: "episode",
            imageType: "Primary",
            maxWidth: 680
        });
        expect(selectCardArtwork({ Id: "movie", Type: "Movie" }, {})).toEqual({
            itemId: "movie",
            imageType: "Thumb",
            maxWidth: 680
        });
    });

    test("selects ordered fallbacks for episode and poster cards", () => {
        expect(selectCardFallbackArtwork(episode, { usePosterImage: true })).toEqual({
            itemId: "episode",
            imageType: "Primary",
            maxWidth: 420
        });
        expect(selectCardFallbackArtwork(episode, { useEpisodeThumbnail: true })).toEqual({
            itemId: "series",
            imageType: "Thumb",
            maxWidth: 680
        });
        expect(selectCardFallbackArtwork(episode, {
            useEpisodeThumbnail: true,
            disableEpisodeThumbnailFallback: true
        })).toBeNull();
        expect(selectCardFallbackArtwork(episode, { useSeriesBackdropFallback: true })).toEqual({
            itemId: "series",
            imageType: "Backdrop",
            maxWidth: 680
        });
    });

    test("builds detail playback labels from resume state and preferred episode copy", () => {
        expect(getDetailPlaybackLabel(
            { Name: "North Station" },
            { UserData: { PlaybackPositionTicks: 10 } },
            "Resume S02 E04"
        )).toBe("Resume S02 E04, North Station");
        expect(getDetailPlaybackLabel(
            { Name: "Signal Fire" },
            { UserData: { PlaybackPositionTicks: 10 } },
            ""
        )).toBe("Resume Signal Fire");
        expect(getDetailPlaybackLabel({ Name: "Signal Fire" }, null, "")).toBe("");
    });
});
