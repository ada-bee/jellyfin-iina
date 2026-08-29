import { describe, expect, test } from "bun:test";

import type { JellyfinPlaybackInfoResponse } from "../jellyfin/types";
import { TICKS_PER_SECOND } from "../shared/constants";

import {
    createPlayItem,
    type SidebarPlaybackDependencies
} from "./playbackService";

function playbackInfo(): JellyfinPlaybackInfoResponse {
    return {
        PlaySessionId: "session",
        MediaSources: [{
            Id: "source",
            SupportsDirectPlay: true
        }]
    };
}

describe("sidebar playback handoff", () => {
    test("resolves episode context and sends one typed IINA message", async () => {
        const messages: Parameters<SidebarPlaybackDependencies["send"]>[0][] = [];
        const playItem = createPlayItem({
            async fetchPlaybackInfo() {
                return playbackInfo();
            },
            async fetchItemDetails() {
                return {
                    Id: "episode",
                    Type: "Episode",
                    Name: "Arrival",
                    SeriesName: "North Station",
                    SeriesId: "series-from-item",
                    SeasonId: "season-from-item",
                    ParentIndexNumber: 2,
                    IndexNumber: 4,
                    RunTimeTicks: 42 * TICKS_PER_SECOND
                };
            },
            getConnection: () => ({
                serverUrl: "https://media.example.test",
                accessToken: "token",
                userId: "user"
            }),
            getDeviceId: () => "device",
            send: message => messages.push(message),
            reportError: error => {
                throw error;
            }
        });

        await playItem(
            "episode",
            "Fallback",
            15 * TICKS_PER_SECOND,
            { seriesId: "preferred-series", episodeIndex: 7 }
        );

        expect(messages).toHaveLength(1);
        expect(messages[0]).toMatchObject({
            resumeSeconds: 15,
            title: "North Station • S02E04 • Arrival",
            playback: {
                itemId: "episode",
                seriesId: "preferred-series",
                seasonId: "season-from-item",
                episodeIndex: 7,
                runtimeTicks: 42 * TICKS_PER_SECOND,
                userId: "user"
            }
        });
    });

    test("reports missing playback info without sending a message", async () => {
        const errors: unknown[] = [];
        let sendCount = 0;
        const playItem = createPlayItem({
            async fetchPlaybackInfo() {
                return null;
            },
            async fetchItemDetails() {
                return null;
            },
            getConnection: () => ({ serverUrl: "", accessToken: "", userId: "" }),
            getDeviceId: () => "",
            send: () => {
                sendCount += 1;
            },
            reportError: error => errors.push(error)
        });

        await playItem("episode", "Episode");

        expect(sendCount).toBe(0);
        expect(errors).toHaveLength(1);
        expect(errors[0]).toBeInstanceOf(Error);
        expect((errors[0] as Error).message).toBe("Missing playback info");
    });
});
