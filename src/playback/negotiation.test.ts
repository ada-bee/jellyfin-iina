import { describe, expect, test } from "bun:test";

import type { JellyfinPlaybackInfoResponse } from "../jellyfin/types";

import { IINA_DEVICE_PROFILE } from "../jellyfin/deviceProfile";
import {
    buildExternalSubtitleTracks,
    buildJellyfinStreamUrl,
    buildJellyfinWindowTitle,
    buildPlaybackHandoff,
    buildPlaybackInfoRequest,
    selectPlayableMediaSource
} from "./negotiation";

const baseOptions = {
    serverUrl: "https://media.example.test/jellyfin/",
    accessToken: "secret token",
    deviceId: "device-id",
    userId: "user-id",
    itemId: "item-id"
};

describe("Jellyfin playback negotiation", () => {
    test("builds stable IINA window titles for Jellyfin item types", () => {
        expect(buildJellyfinWindowTitle(null, "Fallback")).toBe("Fallback");
        expect(buildJellyfinWindowTitle({
            Type: "Episode",
            Name: "Arrival",
            SeriesName: "North Station",
            ParentIndexNumber: 2,
            IndexNumber: 4
        }, "Fallback")).toBe("North Station • S02E04 • Arrival");
        expect(buildJellyfinWindowTitle({
            Type: "Episode",
            Name: "Unknown"
        }, "Fallback")).toBe("S00E00 • Unknown");
        expect(buildJellyfinWindowTitle({
            Type: "Movie",
            Name: "Signal Fire",
            ProductionYear: 2025
        }, "Fallback")).toBe("Signal Fire (2025)");
        expect(buildJellyfinWindowTitle({ Type: "Series" }, "Fallback")).toBe("Fallback");
    });

    test("uses Jellyfin's first direct-play source", () => {
        const response: JellyfinPlaybackInfoResponse = {
            PlaySessionId: "session-id",
            MediaSources: [
                { Id: "unusable", SupportsDirectPlay: false },
                { Id: "preferred", SupportsDirectPlay: true },
                { Id: "later", SupportsDirectPlay: true }
            ]
        };

        expect(selectPlayableMediaSource(response).Id).toBe("preferred");
    });

    test("uses the requested media version instead of the first playable source", () => {
        const response: JellyfinPlaybackInfoResponse = {
            PlaySessionId: "session-id",
            MediaSources: [
                { Id: "source-4k", SupportsDirectPlay: true },
                { Id: "source-1080", SupportsDirectPlay: true }
            ]
        };

        expect(selectPlayableMediaSource(response, "source-1080").Id).toBe("source-1080");
        expect(buildPlaybackHandoff(response, {
            ...baseOptions,
            mediaSourceId: "source-1080"
        })).toMatchObject({
            mediaSourceId: "source-1080"
        });
        expect(() => selectPlayableMediaSource(response, "missing-source")).toThrow(
            "Jellyfin did not provide the selected media source."
        );
    });

    test("fails clearly when Jellyfin provides no playable source", () => {
        const response: JellyfinPlaybackInfoResponse = {
            ErrorCode: "NoCompatibleStream",
            MediaSources: [{ Id: "unusable", SupportsDirectPlay: false }]
        };

        expect(() => selectPlayableMediaSource(response)).toThrow(
            "Jellyfin cannot direct play this item (NoCompatibleStream)."
        );
    });

    test("sends canonical playback options in the request body", () => {
        expect(buildPlaybackInfoRequest("user-id", IINA_DEVICE_PROFILE, {
            mediaSourceId: "source-1080",
            audioStreamIndex: 2,
            subtitleStreamIndex: null
        })).toMatchObject({
            UserId: "user-id",
            MediaSourceId: "source-1080",
            AudioStreamIndex: 2,
            SubtitleStreamIndex: -1,
            DeviceProfile: IINA_DEVICE_PROFILE,
            EnableDirectPlay: true,
            EnableDirectStream: false,
            EnableTranscoding: false
        });
    });

    test("distinguishes default, selected, and disabled subtitles at the API boundary", () => {
        expect(buildPlaybackInfoRequest("user-id", IINA_DEVICE_PROFILE).SubtitleStreamIndex)
            .toBeUndefined();
        expect(buildPlaybackInfoRequest("user-id", IINA_DEVICE_PROFILE, {
            subtitleStreamIndex: 4
        }).SubtitleStreamIndex).toBe(4);
        const response: JellyfinPlaybackInfoResponse = {
            PlaySessionId: "session-id",
            MediaSources: [{
                Id: "source",
                SupportsDirectPlay: true,
                DefaultSubtitleStreamIndex: 4
            }]
        };
        expect(buildPlaybackHandoff(response, {
            ...baseOptions,
            subtitleStreamIndex: null
        }).subtitleStreamIndex).toBeNull();
        response.MediaSources![0]!.DefaultSubtitleStreamIndex = -1;
        expect(buildPlaybackHandoff(response, baseOptions).subtitleStreamIndex).toBeNull();
        expect(buildPlaybackHandoff(response, {
            ...baseOptions,
            subtitleStreamIndex: 4
        }).subtitleStreamIndex).toBe(4);
    });

    test("advertises IINA as an uncapped external player", () => {
        expect(IINA_DEVICE_PROFILE).toMatchObject({
            MaxStreamingBitrate: 2147483647,
            MaxStaticBitrate: 2147483647,
            MusicStreamingTranscodingBitrate: 2147483647,
            DirectPlayProfiles: [
                { Container: "", Type: "Video" },
                { Container: "", Type: "Audio" }
            ]
        });
    });

    test("skips sources requiring remuxing and fails clearly when they are selected", () => {
        const response: JellyfinPlaybackInfoResponse = {
            PlaySessionId: "session-id",
            MediaSources: [
                {
                    Id: "preferred-remux",
                    SupportsDirectPlay: false,
                    SupportsTranscoding: true,
                    TranscodingUrl: "/Videos/item/master.m3u8?VideoCodec=copy&AudioCodec=aac"
                },
                { Id: "alternate-direct", SupportsDirectPlay: true }
            ]
        };

        expect(selectPlayableMediaSource(response).Id).toBe("alternate-direct");
        const handoff = buildPlaybackHandoff(response, baseOptions);
        expect(handoff.playMethod).toBe("DirectPlay");
        expect(handoff.url).toContain("mediaSourceId=alternate-direct");
        expect(() => buildPlaybackHandoff(response, {
            ...baseOptions,
            mediaSourceId: "preferred-remux"
        })).toThrow(
            "Jellyfin cannot direct play this item."
        );
    });

    test("builds a typed handoff from the selected source", () => {
        const response: JellyfinPlaybackInfoResponse = {
            PlaySessionId: "session-id",
            MediaSources: [{
                Id: "source-id",
                RunTimeTicks: 123,
                SupportsDirectPlay: true,
                DefaultAudioStreamIndex: 2,
                DefaultSubtitleStreamIndex: 4,
                MediaStreams: [{
                    Type: "Subtitle",
                    Index: 4,
                    DeliveryMethod: "External",
                    DeliveryUrl: "/Videos/item-id/Subtitles/4/0/Stream.srt",
                    DisplayTitle: "English",
                    Language: "eng",
                    IsForced: true
                }]
            }]
        };

        const handoff = buildPlaybackHandoff(response, baseOptions);

        expect(handoff).toMatchObject({
            serverUrl: "https://media.example.test/jellyfin",
            itemId: "item-id",
            mediaSourceId: "source-id",
            playSessionId: "session-id",
            runtimeTicks: 123,
            playMethod: "DirectPlay",
            audioStreamIndex: 2,
            subtitleStreamIndex: 4,
            externalSubtitles: [{
                index: 4,
                title: "English",
                language: "eng",
                isDefault: true,
                isForced: true
            }]
        });
        expect(handoff.externalSubtitles[0]?.url).toBe(
            "https://media.example.test/jellyfin/Videos/item-id/Subtitles/4/0/Stream.srt"
        );
    });
});

describe("external subtitle delivery", () => {
    test("keeps only externally deliverable subtitle streams", () => {
        const tracks = buildExternalSubtitleTracks({
            DefaultSubtitleStreamIndex: 3,
            MediaStreams: [
                {
                    Type: "Subtitle",
                    Index: 3,
                    DeliveryMethod: "External",
                    DeliveryUrl: "/Videos/item/Subtitles/3/0/Stream.srt",
                    IsHearingImpaired: true
                },
                {
                    Type: "Subtitle",
                    Index: 4,
                    DeliveryMethod: "Embed"
                },
                {
                    Type: "Audio",
                    Index: 5,
                    DeliveryMethod: "External",
                    DeliveryUrl: "/Audio/5"
                }
            ]
        }, baseOptions.serverUrl, baseOptions.itemId);

        expect(tracks).toHaveLength(1);
        expect(tracks[0]).toMatchObject({
            index: 3,
            isDefault: true,
            isHearingImpaired: true
        });
    });

    test("builds missing delivery URLs for direct-play sidecar subtitles", () => {
        const handoff = buildPlaybackHandoff({
            PlaySessionId: "session-id",
            MediaSources: [{
                Id: "source-id",
                SupportsDirectPlay: true,
                DefaultSubtitleStreamIndex: 4,
                MediaStreams: [
                    { Type: "Subtitle", Index: 3, Codec: "ass", IsExternal: true },
                    { Type: "Subtitle", Index: 4, Codec: "subrip", IsExternal: true, Language: "ces" },
                    { Type: "Subtitle", Index: 5, Codec: "webvtt", IsExternal: true },
                    { Type: "Subtitle", Index: 6, Codec: "pgssub", IsExternal: true, IsTextSubtitleStream: false },
                    { Type: "Subtitle", Index: 7, Codec: "ass", IsExternal: false },
                    { Type: "Subtitle", Index: 8, Codec: "dvdsub", IsExternal: true,
                        IsTextSubtitleStream: false, Path: "/media/subtitles.mks" },
                    { Type: "Subtitle", Index: 9, Codec: "dvdsub", IsExternal: true,
                        IsTextSubtitleStream: false, Path: "/media/subtitles.idx" }
                ]
            }]
        }, baseOptions);

        expect(handoff.externalSubtitles.map(track => track.url)).toEqual([
            "https://media.example.test/jellyfin/Videos/item-id/source-id/Subtitles/3/Stream.ass",
            "https://media.example.test/jellyfin/Videos/item-id/source-id/Subtitles/4/Stream.srt",
            "https://media.example.test/jellyfin/Videos/item-id/source-id/Subtitles/5/Stream.vtt",
            "https://media.example.test/jellyfin/Videos/item-id/source-id/Subtitles/6/Stream.pgssub",
            "https://media.example.test/jellyfin/Videos/item-id/source-id/Subtitles/8/Stream.mks"
        ]);
        expect(handoff.externalSubtitles[1]).toMatchObject({ index: 4, isDefault: true, language: "ces" });
        expect(handoff.externalSubtitles.filter(track => track.isDefault)).toHaveLength(1);
    });

    test("preserves supplied delivery URLs and sanitizes legacy tokens", () => {
        const tracks = buildExternalSubtitleTracks({
            Id: "source-id",
            MediaStreams: [{
                Type: "Subtitle", Index: 2, IsExternal: true,
                DeliveryUrl: "/jellyfin/Videos/item-id/source-id/Subtitles/2/Stream.srt?api_key=old-token&tag=revision"
            }]
        }, baseOptions.serverUrl, baseOptions.itemId);

        expect(tracks[0]?.url).toBe(
            "https://media.example.test/jellyfin/Videos/item-id/source-id/Subtitles/2/Stream.srt?tag=revision"
        );
    });

    test("does not select external subtitles when Jellyfin remembers Off", () => {
        const handoff = buildPlaybackHandoff({
            PlaySessionId: "session-id",
            MediaSources: [{
                Id: "source-id", SupportsDirectPlay: true, DefaultSubtitleStreamIndex: -1,
                MediaStreams: [{ Type: "Subtitle", Index: 4, IsExternal: true, Codec: "srt", IsDefault: true }]
            }]
        }, baseOptions);

        expect(handoff.subtitleStreamIndex).toBeNull();
        expect(handoff.externalSubtitles[0]?.isDefault).toBe(false);
    });

    test("omits invalid deliveries and unavailable fallback routes", () => {
        const tracks = buildExternalSubtitleTracks({
            MediaStreams: [
                { Type: "Subtitle", Index: 1, IsExternal: true, Codec: "srt" },
                { Type: "Subtitle", Index: -1, IsExternal: true, DeliveryUrl: "/subtitle.srt" },
                { Type: "Subtitle", IsExternal: true, DeliveryUrl: "/subtitle.srt" },
                { Type: "Subtitle", Index: 2, IsExternal: true, DeliveryUrl: "http://media.example.test/subtitle.srt" }
            ]
        }, baseOptions.serverUrl, baseOptions.itemId);

        expect(tracks).toEqual([]);
    });
});

describe("Jellyfin stream URLs", () => {
    test("preserves a Base URL path prefix", () => {
        const url = buildJellyfinStreamUrl({
            ...baseOptions,
            mediaSourceId: "source-id",
            playSessionId: "session-id"
        });

        expect(url).toStartWith("https://media.example.test/jellyfin/Videos/item-id/stream?");
    });

    test("rejects path separators in malformed item ids", () => {
        const url = buildJellyfinStreamUrl({
            ...baseOptions,
            itemId: "item/id",
            mediaSourceId: "source-id",
            playSessionId: "session-id"
        });

        expect(url).toBe("");
    });

    test("does not encode internal playback state into the media URL", () => {
        const url = buildJellyfinStreamUrl({
            ...baseOptions,
            mediaSourceId: "source-id",
            playSessionId: "session-id"
        });

        expect(url).not.toContain("_jf_");
        expect(url).toContain("mediaSourceId=source-id");
        expect(url).toContain("playSessionId=session-id");
        expect(url).not.toContain("api_key");
        expect(url).not.toContain("secret");
    });
});
