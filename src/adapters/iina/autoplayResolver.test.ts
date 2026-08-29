import { describe, expect, test } from "bun:test";

import type { JellyfinPlaybackInfoResponse } from "../../jellyfin/types";
import type { PlaybackSession } from "../../playback/ports";
import type { HttpContext, HttpRequestOptions } from "./apiClient";

import { createAutoplayResolver } from "./autoplayResolver";

function session(overrides: Partial<PlaybackSession> = {}): PlaybackSession {
    return {
        itemId: "episode-1",
        mediaSourceId: "source-1",
        playSessionId: "play-session-1",
        accessToken: "token",
        deviceId: "device",
        serverUrl: "https://media.example.test",
        runtimeTicks: 100,
        playMethod: "DirectPlay",
        externalSubtitles: [],
        userId: "user",
        isEpisode: true,
        seriesId: "series",
        seasonId: "season-1",
        episodeIndex: 1,
        ...overrides
    };
}

function directPlayInfo(): JellyfinPlaybackInfoResponse {
    return {
        PlaySessionId: "play-session-2",
        MediaSources: [{ Id: "source-2", SupportsDirectPlay: true }]
    };
}

describe("IINA autoplay resolver", () => {
    test("resolves and negotiates the next episode in the current season", async () => {
        const requests: HttpRequestOptions[] = [];
        const resolver = createAutoplayResolver({
            async requestJson<T>(_context: HttpContext, options: HttpRequestOptions): Promise<T | null> {
                requests.push(options);
                if (options.endpoint === "/Items/episode-1") {
                    return {
                        Id: "episode-1",
                        Type: "Episode",
                        SeriesId: "series",
                        SeasonId: "season-1",
                        IndexNumber: 1
                    } as T;
                }
                if (options.endpoint === "/Shows/series/Episodes") {
                    return { Items: [
                        { Id: "episode-1", Type: "Episode", IndexNumber: 1 },
                        {
                            Id: "episode-2",
                            Type: "Episode",
                            SeriesId: "series",
                            SeasonId: "season-1",
                            IndexNumber: 2
                        }
                    ] } as T;
                }
                if (options.endpoint === "/Items/episode-2/PlaybackInfo") {
                    return directPlayInfo() as T;
                }
                if (options.endpoint === "/Items/episode-2") {
                    return {
                        Id: "episode-2",
                        Type: "Episode",
                        Name: "Second Signal",
                        SeriesName: "North Station",
                        SeriesId: "series",
                        SeasonId: "season-1",
                        ParentIndexNumber: 1,
                        IndexNumber: 2,
                        RunTimeTicks: 200
                    } as T;
                }
                throw new Error(`Unexpected request: ${options.endpoint}`);
            }
        });

        const result = await resolver(session());

        expect(result).toMatchObject({
            title: "North Station • S01E02 • Second Signal",
            handoff: {
                itemId: "episode-2",
                seriesId: "series",
                seasonId: "season-1",
                episodeIndex: 2,
                runtimeTicks: 200
            }
        });
        expect(requests.map(request => request.endpoint)).toEqual([
            "/Items/episode-1",
            "/Shows/series/Episodes",
            "/Items/episode-2/PlaybackInfo",
            "/Items/episode-2"
        ]);
    });

    test("returns early when the handoff lacks authenticated context", async () => {
        let requestCount = 0;
        const resolver = createAutoplayResolver({
            async requestJson<T>(): Promise<T | null> {
                requestCount += 1;
                return null;
            }
        });

        expect(await resolver(session({ accessToken: "" }))).toBeNull();
        expect(requestCount).toBe(0);
    });
});
