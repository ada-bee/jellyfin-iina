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

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<T>((complete, fail) => {
        resolve = complete;
        reject = fail;
    });
    return { promise, resolve, reject };
}

function playbackHarness() {
    const messages: Parameters<SidebarPlaybackDependencies["send"]>[0][] = [];
    const errors: unknown[] = [];
    const connection = {
        serverUrl: "https://media.example.test",
        accessToken: "token",
        userId: "user"
    };
    const dependencies: SidebarPlaybackDependencies = {
        fetchPlaybackInfo: async () => playbackInfo(),
        fetchItemDetails: async () => null,
        getConnection: () => connection,
        getDeviceId: () => "device",
        send: message => messages.push(message),
        reportError: error => errors.push(error)
    };
    return { dependencies, connection, messages, errors };
}

describe("sidebar playback handoff", () => {
    test("resolves episode context and sends one typed IINA message", async () => {
        const messages: Parameters<SidebarPlaybackDependencies["send"]>[0][] = [];
        const requestedSelections: unknown[] = [];
        const playItem = createPlayItem({
            async fetchPlaybackInfo(_itemId, selection) {
                requestedSelections.push(selection);
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
            {
                seriesId: "preferred-series",
                episodeIndex: 7,
                mediaSourceId: "source",
                audioStreamIndex: 5,
                subtitleStreamIndex: null
            }
        );

        expect(requestedSelections).toEqual([{
            seriesId: "preferred-series",
            episodeIndex: 7,
            mediaSourceId: "source",
            audioStreamIndex: 5,
            subtitleStreamIndex: null
        }]);
        expect(messages).toHaveLength(1);
        expect(messages[0]).toMatchObject({
            resumeSeconds: 15,
            title: "North Station • S02E04 • Arrival",
            playback: {
                itemId: "episode",
                seriesId: "preferred-series",
                seasonId: "season-from-item",
                episodeIndex: 7,
                mediaSourceId: "source",
                audioStreamIndex: 5,
                subtitleStreamIndex: null,
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

    test.each(["info", "details"])("newer Play wins while older %s is pending", async phase => {
        const harness = playbackHarness();
        const pending = deferred<null>();
        if (phase === "info") {
            harness.dependencies.fetchPlaybackInfo = async itemId =>
                itemId === "older" ? pending.promise : playbackInfo();
        } else {
            harness.dependencies.fetchItemDetails = async itemId =>
                itemId === "older" ? pending.promise : null;
        }
        const play = createPlayItem(harness.dependencies);
        const older = play("older", "Older");
        await Promise.resolve();
        await play("newer", "Newer");
        pending.resolve(null);
        await older;

        expect(harness.messages.map(message => message.playback.itemId)).toEqual(["newer"]);
        expect(harness.errors).toEqual([]);
    });

    test.each(["info", "details"])("discards %s from an obsolete session", async phase => {
        const harness = playbackHarness();
        const pending = deferred<null>();
        let detailsRequested = false;
        harness.dependencies.fetchPlaybackInfo = async () =>
            phase === "info" ? pending.promise : playbackInfo();
        harness.dependencies.fetchItemDetails = async () => {
            detailsRequested = true;
            return pending.promise;
        };
        const play = createPlayItem(harness.dependencies);
        const request = play("episode", "Episode");
        await Promise.resolve();
        harness.connection.accessToken = "new-session";
        pending.resolve(null);
        await request;

        expect(harness.messages).toEqual([]);
        expect(harness.errors).toEqual([]);
        expect(detailsRequested).toBe(phase === "details");
    });

    test("ignores errors from a replaced Play request", async () => {
        const harness = playbackHarness();
        const pending = deferred<JellyfinPlaybackInfoResponse>();
        harness.dependencies.fetchPlaybackInfo = async itemId =>
            itemId === "older" ? pending.promise : playbackInfo();
        const play = createPlayItem(harness.dependencies);
        const older = play("older", "Older");
        await play("newer", "Newer");
        pending.reject(new Error("Old request failed"));
        await older;

        expect(harness.errors).toEqual([]);
        expect(harness.messages.map(message => message.playback.itemId)).toEqual(["newer"]);
    });

    test.each([false, true])("preserves queue order after earlier failure: %s", async fails => {
        const harness = playbackHarness();
        const pending = deferred<JellyfinPlaybackInfoResponse>();
        harness.dependencies.fetchPlaybackInfo = async itemId =>
            itemId === "first" ? pending.promise : playbackInfo();
        const queue = createPlayItem(harness.dependencies, "ordered");
        const first = queue("first", "First");
        const second = queue("second", "Second");
        await Promise.resolve();
        expect(harness.messages).toEqual([]);
        if (fails) {
            pending.reject(new Error("First failed"));
        } else {
            pending.resolve(playbackInfo());
        }
        await Promise.all([first, second]);

        expect(harness.messages.map(message => message.playback.itemId))
            .toEqual(fails ? ["second"] : ["first", "second"]);
        expect(harness.errors).toHaveLength(fails ? 1 : 0);
    });

    test("session reset cancels pending queue adds and allows new work immediately", async () => {
        const harness = playbackHarness();
        const pending = deferred<JellyfinPlaybackInfoResponse>();
        const requested: string[] = [];
        harness.dependencies.fetchPlaybackInfo = async itemId => {
            requested.push(itemId);
            return itemId === "old" ? pending.promise : playbackInfo();
        };
        const queue = createPlayItem(harness.dependencies, "ordered");
        const old = queue("old", "Old");
        const cancelled = queue("cancelled", "Cancelled");
        await Promise.resolve();
        queue.cancel();
        await queue("new", "New");
        pending.resolve(playbackInfo());
        await Promise.all([old, cancelled]);

        expect(requested).toEqual(["old", "new"]);
        expect(harness.messages.map(message => message.playback.itemId)).toEqual(["new"]);
        expect(harness.errors).toEqual([]);
    });
});
