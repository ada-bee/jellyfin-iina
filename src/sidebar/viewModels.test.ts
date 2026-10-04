import { describe, expect, test } from "bun:test";
import type { JellyfinBaseItem } from "../jellyfin/types";

import {
    buildMediaCardViewModel,
    buildMediaDetailsViewModel,
    buildSeriesNextUpViewModel,
    buildSearchResultsViewModel,
    getPlayActionLabel
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
            context: {
                id: "episode-1",
                name: "The Plan",
                resume: 15 * TICKS_PER_MINUTE,
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
            mediaFileSources: []
        });

        const series: JellyfinBaseItem = {
            Type: "Series",
            ProductionYear: 2024,
            Status: "Continuing"
        };
        expect(buildMediaDetailsViewModel(series, 2).metadata).toBe("2024– · 2 seasons");
    });

    test("builds episode detail metadata", () => {
        const episode: JellyfinBaseItem = {
            Type: "Episode",
            SeriesName: "North Station",
            ParentIndexNumber: 2,
            IndexNumber: 3,
            RunTimeTicks: 48 * TICKS_PER_MINUTE,
            OfficialRating: "TV-14"
        };

        expect(buildMediaDetailsViewModel(episode).metadata)
            .toBe("North Station · S02 E03 · 48m · TV-14");
    });

    test("formats movie video, audio, and subtitle streams", () => {
        const movie: JellyfinBaseItem = {
            Type: "Movie",
            MediaSources: [{
                Id: "source-1080",
                DefaultAudioStreamIndex: 1,
                DefaultSubtitleStreamIndex: 2,
                MediaStreams: [
                    { Type: "Video", Width: 1920, Height: 800, Codec: "h264", BitRate: 8_000_000 },
                    { Type: "Audio", Index: 1, Language: "eng", Codec: "eac3", Channels: 6 },
                    {
                        Type: "Subtitle",
                        Index: 2,
                        Language: "eng",
                        Codec: "subrip",
                        IsHearingImpaired: true
                    },
                    { Type: "Subtitle", Index: 3, Language: "spa", Codec: "hdmv_pgs_subtitle" }
                ]
            }]
        };

        expect(buildMediaDetailsViewModel(movie).mediaFileSources).toEqual([{
            mediaSourceId: "source-1080",
            groups: [
                {
                    kind: "video",
                    label: "Video",
                    tracks: [{
                        title: "1080p",
                        technical: "AVC · 8 Mbps",
                        mediaSourceId: "source-1080",
                        streamIndex: null,
                        selected: true,
                        selectable: false
                    }]
                },
                {
                    kind: "audio",
                    label: "Audio",
                    tracks: [{
                        title: "English",
                        technical: "Dolby Digital Plus 5.1",
                        mediaSourceId: null,
                        streamIndex: 1,
                        selected: true,
                        selectable: false
                    }]
                },
                {
                    kind: "subtitle",
                    label: "Subtitles",
                    tracks: [
                        {
                            title: "English",
                            technical: "SDH · SRT",
                            mediaSourceId: null,
                            streamIndex: 2,
                            selected: true,
                            selectable: true
                        },
                        {
                            title: "Spanish",
                            technical: "PGS",
                            mediaSourceId: null,
                            streamIndex: 3,
                            selected: false,
                            selectable: true
                        }
                    ]
                }
            ]
        }]);
    });

    test("only makes audio tracks selectable when alternatives exist", () => {
        const buildAudioTracks = (streams: JellyfinBaseItem["MediaSources"]) =>
            buildMediaDetailsViewModel({ Type: "Movie", MediaSources: streams })
                .mediaFileSources[0]?.groups.find(group => group.kind === "audio")?.tracks;

        expect(buildAudioTracks([{ MediaStreams: [
            { Type: "Audio", Index: 1, Language: "eng" }
        ] }])?.map(track => track.selectable)).toEqual([false]);
        expect(buildAudioTracks([{ MediaStreams: [
            { Type: "Audio", Index: 1, Language: "eng" },
            { Type: "Audio", Index: 2, Language: "spa" }
        ] }])?.map(track => track.selectable)).toEqual([true, true]);
    });

    test("sorts audio and subtitle tracks by stream index", () => {
        const groups = buildMediaDetailsViewModel({
            Type: "Movie",
            MediaSources: [{
                MediaStreams: [
                    { Type: "Audio", Index: 4, Language: "spa" },
                    { Type: "Subtitle", Index: 8, Language: "eng" },
                    { Type: "Audio", Language: "fra" },
                    { Type: "Subtitle", Index: 3, Language: "spa" },
                    { Type: "Audio", Index: 2, Language: "eng" }
                ]
            }]
        }).mediaFileSources[0]?.groups;

        expect(groups?.find(group => group.kind === "audio")?.tracks
            .map(track => track.streamIndex)).toEqual([2, 4, null]);
        expect(groups?.find(group => group.kind === "subtitle")?.tracks
            .map(track => track.streamIndex)).toEqual([3, 8]);
    });

    test.each([null, -1, undefined, 2])("honors the server subtitle default %s", defaultIndex => {
        const groups = buildMediaDetailsViewModel({
            MediaSources: [{
                DefaultSubtitleStreamIndex: defaultIndex,
                MediaStreams: [
                    { Type: "Subtitle", Index: 1, IsDefault: true },
                    { Type: "Subtitle", Index: 2 }
                ]
            }]
        }).mediaFileSources[0]?.groups;

        const selected = groups?.find(group => group.kind === "subtitle")?.tracks
            .filter(track => track.selected).map(track => track.streamIndex);
        expect(selected).toEqual(defaultIndex === undefined ? [1] : defaultIndex === 2 ? [2] : []);
    });

    test("models every video version with its own available tracks", () => {
        const sources = buildMediaDetailsViewModel({
            Type: "Movie",
            MediaSources: [
                {
                    Id: "source-4k",
                    DefaultAudioStreamIndex: 2,
                    MediaStreams: [
                        {
                            Type: "Video",
                            Width: 3840,
                            Height: 1600,
                            Codec: "hevc",
                            BitRate: 18_000_000
                        },
                        { Type: "Audio", Index: 2, Language: "eng" }
                    ]
                },
                {
                    Id: "source-1080",
                    DefaultAudioStreamIndex: 5,
                    MediaStreams: [
                        {
                            Type: "Video",
                            Width: 1920,
                            Height: 800,
                            Codec: "h264",
                            BitRate: 8_000_000
                        },
                        { Type: "Audio", Index: 5, Language: "spa" },
                        { Type: "Audio", Index: 6, Language: "fra" }
                    ]
                },
                {
                    Id: "source-1080-efficient",
                    MediaStreams: [{
                        Type: "Video",
                        Width: 1920,
                        Height: 800,
                        Codec: "av1",
                        BitRate: 5_000_000
                    }]
                },
                {
                    Id: "source-720",
                    MediaStreams: [{
                        Type: "Video",
                        Width: 1280,
                        Height: 534,
                        Codec: "mpeg2video",
                        BitRate: 4_000_000
                    }]
                }
            ]
        }).mediaFileSources;

        expect(sources.map(source => source.groups[0]?.tracks[0])).toMatchObject([
            {
                title: "720p",
                technical: "MPEG-2 · 4 Mbps",
                mediaSourceId: "source-720",
                selected: false,
                selectable: true
            },
            {
                title: "1080p",
                technical: "AV1 · 5 Mbps",
                mediaSourceId: "source-1080-efficient",
                selected: false,
                selectable: true
            },
            {
                title: "1080p",
                technical: "AVC · 8 Mbps",
                mediaSourceId: "source-1080",
                selected: false,
                selectable: true
            },
            {
                title: "2160p",
                technical: "HEVC · 18 Mbps",
                mediaSourceId: "source-4k",
                selected: true,
                selectable: true
            }
        ]);
        expect(sources.find(source => source.mediaSourceId === "source-4k")
            ?.groups.find(group => group.kind === "audio")?.tracks)
            .toMatchObject([{ title: "English", selected: true, selectable: false }]);
        expect(sources.find(source => source.mediaSourceId === "source-1080")
            ?.groups.find(group => group.kind === "audio")?.tracks)
            .toMatchObject([
                { title: "Spanish", selected: true, selectable: true },
                { title: "French", selected: false, selectable: true }
            ]);
    });

    test("groups all search results by type and caps each section at six", () => {
        const items: JellyfinBaseItem[] = [
            ...Array.from({ length: 8 }, (_, index) => ({
                Id: `episode-${index}`,
                Type: "Episode" as const
            })),
            ...Array.from({ length: 8 }, (_, index) => ({
                Id: `movie-${index}`,
                Type: "Movie" as const
            })),
            ...Array.from({ length: 8 }, (_, index) => ({
                Id: `series-${index}`,
                Type: "Series" as const
            })),
            { Id: "audio", Type: "Audio" }
        ];

        const all = buildSearchResultsViewModel(items, "all");
        expect(all.sections.map(section => ({
            filter: section.filter,
            count: section.items.length
        }))).toEqual([
            { filter: "movie", count: 6 },
            { filter: "series", count: 6 },
            { filter: "episode", count: 6 }
        ]);
        expect(all.visibleItems.map(item => item.Id)).toEqual([
            ...Array.from({ length: 6 }, (_, index) => `movie-${index}`),
            ...Array.from({ length: 6 }, (_, index) => `series-${index}`),
            ...Array.from({ length: 6 }, (_, index) => `episode-${index}`)
        ]);

        const episodes = buildSearchResultsViewModel(items, "episode");
        expect(episodes.sections.map(section => section.filter)).toEqual(["episode"]);
        expect(episodes.visibleItems).toHaveLength(8);
        expect(episodes.emptyMessage).toBe("No Episodes Found");
    });

    test("labels next-up playback from its resume state", () => {
        const episode: JellyfinBaseItem = {
            Name: "Return Signal",
            ParentIndexNumber: 1,
            IndexNumber: 8,
            RunTimeTicks: 47 * TICKS_PER_MINUTE,
            UserData: { PlaybackPositionTicks: 10 }
        };
        expect(buildSeriesNextUpViewModel(episode)).toEqual({
            episodeNumber: "S01E08",
            title: "Return Signal",
            duration: "47min"
        });
        expect(getPlayActionLabel({ UserData: { Played: true, PlaybackPositionTicks: 10 } }))
            .toBe("Play");
    });
});
