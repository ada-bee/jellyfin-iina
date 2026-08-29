import { describe, expect, test } from "bun:test";

import type { JellyfinPlaybackInfoResponse } from "./jellyfin";

import { IINA_DEVICE_PROFILE } from "./deviceProfile";
import {
    buildAuthenticatedDeliveryUrl,
    buildExternalSubtitleTracks,
    buildJellyfinStreamUrl,
    buildPlaybackHandoff,
    buildPlaybackInfoRequest,
    resolveTranscodingPlayMethod,
    selectPlayableMediaSource
} from "./playback";

const baseOptions = {
    serverUrl: "https://media.example.test/jellyfin/",
    accessToken: "secret token",
    deviceId: "device-id",
    userId: "user-id",
    itemId: "item-id"
};

describe("Jellyfin playback negotiation", () => {
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

    test("fails clearly when Jellyfin provides no playable source", () => {
        const response: JellyfinPlaybackInfoResponse = {
            ErrorCode: "NoCompatibleStream",
            MediaSources: [{ Id: "unusable", SupportsDirectPlay: false }]
        };

        expect(() => selectPlayableMediaSource(response)).toThrow(
            "Jellyfin did not provide a playable media source (NoCompatibleStream)."
        );
    });

    test("sends canonical playback options in the request body", () => {
        expect(buildPlaybackInfoRequest("user-id", IINA_DEVICE_PROFILE)).toMatchObject({
            UserId: "user-id",
            DeviceProfile: IINA_DEVICE_PROFILE,
            EnableDirectPlay: true,
            EnableDirectStream: true,
            EnableTranscoding: true
        });
    });

    test("keeps Jellyfin's source order when the preferred source requires remuxing", () => {
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

        expect(selectPlayableMediaSource(response).Id).toBe("preferred-remux");
        const handoff = buildPlaybackHandoff(response, baseOptions);
        expect(handoff.playMethod).toBe("DirectStream");
        expect(handoff.url).toBe(
            "https://media.example.test/jellyfin/Videos/item/master.m3u8" +
            "?VideoCodec=copy&AudioCodec=aac&api_key=secret%20token"
        );
    });

    test("reports video encoding as transcoding", () => {
        expect(resolveTranscodingPlayMethod({
            TranscodingUrl: "/Videos/item/master.m3u8?VideoCodec=h264&AudioCodec=aac",
            MediaStreams: [{ Type: "Video" }]
        })).toBe("Transcode");
    });

    test("reports audio-only stream copy as direct streaming", () => {
        expect(resolveTranscodingPlayMethod({
            TranscodingUrl: "/Audio/item/universal?AudioCodec=copy",
            MediaStreams: [{ Type: "Audio" }]
        })).toBe("DirectStream");
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
            "https://media.example.test/jellyfin/Videos/item-id/Subtitles/4/0/Stream.srt?api_key=secret%20token"
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
        }, baseOptions.serverUrl, baseOptions.accessToken);

        expect(tracks).toHaveLength(1);
        expect(tracks[0]).toMatchObject({
            index: 3,
            isDefault: true,
            isHearingImpaired: true
        });
    });

    test("does not duplicate an existing Jellyfin access token", () => {
        const url = buildAuthenticatedDeliveryUrl(
            baseOptions.serverUrl,
            "/Videos/item/Subtitles/3/0/Stream.srt?api_key=already-present",
            baseOptions.accessToken
        );

        expect(url.match(/api_key=/g)).toHaveLength(1);
    });

    test("does not send the Jellyfin token to another host", () => {
        const url = buildAuthenticatedDeliveryUrl(
            baseOptions.serverUrl,
            "https://subtitles.example.test/subtitle.srt",
            baseOptions.accessToken
        );

        expect(url).toBe("https://subtitles.example.test/subtitle.srt");
    });

    test("rejects insecure subtitle delivery", () => {
        expect(buildAuthenticatedDeliveryUrl(
            baseOptions.serverUrl,
            "http://subtitles.example.test/subtitle.srt",
            baseOptions.accessToken
        )).toBe("");
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

    test("encodes the item id as one route segment", () => {
        const url = buildJellyfinStreamUrl({
            ...baseOptions,
            itemId: "item/id",
            mediaSourceId: "source-id",
            playSessionId: "session-id"
        });

        expect(url).toStartWith("https://media.example.test/jellyfin/Videos/item%2Fid/stream?");
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
    });
});
