import { describe, expect, test } from "bun:test";
import type { JellyfinBaseItem } from "../jellyfin/types";

import {
    buildMediaCardViewModel,
    buildMediaDetailsViewModel,
    buildSearchResultsViewModel,
    getSeriesPlayLabel
} from "./viewModels";

const TICKS_PER_MINUTE = 600_000_000;

describe("sidebar view models", () => {
    test("builds episode card copy, context, progress, and accessibility text", () => {
        const episode: JellyfinBaseItem = {
            Id: "episode-1",
            Name: "The Plan",
            Type: "Episode",
            SeriesId: "series-1",
            SeasonId: "season-2",
            SeriesName: "North Station",
            ParentIndexNumber: 2,
            IndexNumber: 3,
            RunTimeTicks: 60 * TICKS_PER_MINUTE,
            UserData: { PlaybackPositionTicks: 15 * TICKS_PER_MINUTE }
        };

        const viewModel = buildMediaCardViewModel(episode, {
            homeThumbnail: true,
            directPlay: true,
            showSeriesName: true,
            showEpisodeNumber: true,
            hideRuntime: true
        });

        expect(viewModel).toMatchObject({
            title: "The Plan",
            metadata: "North Station · S02 E03",
            accessibleName: "The Plan, North Station · S02 E03, 45 min left",
            remainingLabel: "45 min left",
            progressPercent: 25,
            showPlayOverlay: true,
            context: {
                id: "episode-1",
                name: "The Plan",
                resume: 15 * TICKS_PER_MINUTE,
                directPlay: true,
                context: {
                    seriesId: "series-1",
                    seasonId: "season-2",
                    episodeIndex: 3
                }
            }
        });
    });

    test("builds episode-row labels separately from list metadata", () => {
        const episode: JellyfinBaseItem = {
            Name: "Arrival",
            Type: "Episode",
            IndexNumber: 4,
            RunTimeTicks: 46 * TICKS_PER_MINUTE,
            Overview: "A new signal appears."
        };

        expect(buildMediaCardViewModel(episode, {
            showSeriesName: false,
            showEpisodeNumber: true,
            episodeRow: true
        })).toMatchObject({
            title: "Arrival",
            episodeNumber: "E04",
            episodeRuntime: "46m",
            accessibleName: "E04 Arrival, 46m",
            overview: "A new signal appears."
        });
    });

    test("applies episode copy policies independently", () => {
        const episode: JellyfinBaseItem = {
            Name: "Arrival",
            Type: "Episode",
            SeriesName: "North Station",
            ParentIndexNumber: 2,
            IndexNumber: 4,
            RunTimeTicks: 46 * TICKS_PER_MINUTE
        };

        expect(buildMediaCardViewModel(episode, {
            showSeriesName: true,
            showEpisodeNumber: true
        })).toMatchObject({
            title: "North Station",
            metadata: "S02 E04 · Arrival · 46m"
        });
        expect(buildMediaCardViewModel(episode, {
            showSeriesName: false,
            showEpisodeNumber: true,
            hideRuntime: true
        })).toMatchObject({
            title: "Arrival",
            metadata: "S02 E04"
        });
        expect(buildMediaCardViewModel(episode, {
            homeThumbnail: true,
            showEpisodeNumber: false
        })).toMatchObject({
            title: "Arrival",
            metadata: "North Station"
        });
    });

    test("builds non-episode card metadata without episode policy leakage", () => {
        const series: JellyfinBaseItem = {
            Name: "North Station",
            Type: "Series",
            ProductionYear: 2024,
            RunTimeTicks: 50 * TICKS_PER_MINUTE,
            RecursiveItemCount: 12,
            UserData: { UnplayedItemCount: 3 }
        };

        expect(buildMediaCardViewModel(series, { showSeriesEpisodeCounts: true })).toMatchObject({
            title: "North Station",
            metadata: "2024 · 50m · 9 of 12 watched"
        });
        expect(buildMediaCardViewModel(series, { hideRuntime: true })).toMatchObject({
            metadata: "2024"
        });
    });

    test("builds movie and continuing-series detail copy", () => {
        const movie: JellyfinBaseItem = {
            Name: "Signal Fire",
            Type: "Movie",
            ProductionYear: 2025,
            RunTimeTicks: 112 * TICKS_PER_MINUTE,
            OfficialRating: "PG-13",
            Taglines: ["", "  Some signals are better left unanswered.  "],
            Overview: "A mysterious transmission arrives.",
            UserData: { Played: true }
        };
        expect(buildMediaDetailsViewModel(movie)).toEqual({
            metadata: "2025 · 1h 52m · PG-13",
            tagline: "Some signals are better left unanswered.",
            overview: "A mysterious transmission arrives.",
            watched: true
        });

        const series: JellyfinBaseItem = {
            Type: "Series",
            ProductionYear: 2024,
            Status: "Continuing"
        };
        expect(buildMediaDetailsViewModel(series, 2).metadata).toBe("2024– · 2 seasons");
    });

    test("groups filtered search results without changing their order", () => {
        const items: JellyfinBaseItem[] = [
            { Id: "episode", Type: "Episode" },
            { Id: "series", Type: "Series" },
            { Id: "movie", Type: "Movie" },
            { Id: "audio", Type: "Audio" }
        ];

        const all = buildSearchResultsViewModel(items, "all");
        expect(all.posterItems.map(item => item.Id)).toEqual(["series", "movie"]);
        expect(all.remainingItems.map(item => item.Id)).toEqual(["episode", "audio"]);
        expect(all.visibleItems).not.toBe(items);

        const episodes = buildSearchResultsViewModel(items, "episode");
        expect(episodes.visibleItems.map(item => item.Id)).toEqual(["episode"]);
        expect(episodes.emptyMessage).toBe("No Episodes Found");
    });

    test("labels next-up playback from its resume state", () => {
        const episode: JellyfinBaseItem = {
            ParentIndexNumber: 1,
            IndexNumber: 8,
            UserData: { PlaybackPositionTicks: 10 }
        };
        expect(getSeriesPlayLabel(episode)).toBe("Resume S01 E08");
    });
});
