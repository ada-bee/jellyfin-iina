import { describe, expect, test } from "bun:test";

import type { JellyfinPlaybackInfoResponse } from "./jellyfin";

import { IINA_DEVICE_PROFILE } from "./deviceProfile";
import {
    buildJellyfinStreamUrl,
    buildPlaybackHandoff,
    buildPlaybackInfoRequest,
    selectDirectPlaySource
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

        expect(selectDirectPlaySource(response).Id).toBe("preferred");
    });

    test("fails clearly when Jellyfin provides no playable source", () => {
        const response: JellyfinPlaybackInfoResponse = {
            ErrorCode: "NoCompatibleStream",
            MediaSources: [{ Id: "unusable", SupportsDirectPlay: false }]
        };

        expect(() => selectDirectPlaySource(response)).toThrow(
            "Jellyfin did not provide a playable media source (NoCompatibleStream)."
        );
    });

    test("sends canonical playback options in the request body", () => {
        expect(buildPlaybackInfoRequest("user-id", IINA_DEVICE_PROFILE)).toMatchObject({
            UserId: "user-id",
            DeviceProfile: IINA_DEVICE_PROFILE,
            EnableDirectPlay: true,
            EnableDirectStream: true,
            EnableTranscoding: false
        });
    });

    test("builds a typed handoff from the selected source", () => {
        const response: JellyfinPlaybackInfoResponse = {
            PlaySessionId: "session-id",
            MediaSources: [{
                Id: "source-id",
                RunTimeTicks: 123,
                SupportsDirectPlay: true,
                DefaultAudioStreamIndex: 2,
                DefaultSubtitleStreamIndex: 4
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
            subtitleStreamIndex: 4
        });
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
