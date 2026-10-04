import { describe, expect, test } from "bun:test";

import { JELLYFIN_LIBRARY_HOST_URL } from "./constants";
import { IinaPlayer } from "./player";
import type { PlaybackHandoff } from "../../jellyfin/types";

describe("IINA player adapter", () => {
    test("uses a library host URL that IINA can parse without rewriting", () => {
        expect(new URL(JELLYFIN_LIBRARY_HOST_URL).href).toBe(JELLYFIN_LIBRARY_HOST_URL);
    });

    test("opens the library host through IINA so an idle player gets a window", () => {
        const opened: string[] = [];
        const previousIina = globalThis.iina;
        globalThis.iina = {
            core: {
                open: (url: string) => opened.push(url)
            }
        } as typeof iina;

        try {
            const player = new IinaPlayer({
                debug: () => undefined,
                error: () => undefined
            });
            player.open(JELLYFIN_LIBRARY_HOST_URL);
        } finally {
            globalThis.iina = previousIina;
        }

        expect(opened).toEqual([JELLYFIN_LIBRARY_HOST_URL]);
    });

    test("pauses through IINA's player lifecycle", () => {
        let pauseCount = 0;
        const previousIina = globalThis.iina;
        globalThis.iina = {
            core: {
                pause: () => {
                    pauseCount += 1;
                }
            }
        } as typeof iina;

        try {
            const player = new IinaPlayer({
                debug: () => undefined,
                error: () => undefined
            });
            player.pause();
        } finally {
            globalThis.iina = previousIina;
        }

        expect(pauseCount).toBe(1);
    });

    test("keeps authorization in per-file options for every playlist load mode", () => {
        const commands: { name: string; args: string[] }[] = [];
        const changedProperties: string[] = [];
        const previousIina = globalThis.iina;
        globalThis.iina = {
            mpv: {
                command: (name: string, args: string[]) => commands.push({ name, args }),
                set: (name: string) => changedProperties.push(name)
            }
        } as unknown as typeof iina;
        const handoff: PlaybackHandoff = {
            url: "https://media.example.test/jellyfin/Videos/item/stream?Static=true",
            serverUrl: "https://media.example.test/jellyfin", accessToken: "token", deviceId: "device",
            userId: "user", itemId: "item", mediaSourceId: "source", playSessionId: "session",
            runtimeTicks: 0, playMethod: "DirectPlay", externalSubtitles: []
        };
        try {
            const player = new IinaPlayer({ debug: () => undefined, error: () => undefined });
            player.loadReplacement(handoff, "Žluťoučký 🐝");
            player.loadNext(handoff, "Next");
            player.loadAppend(handoff, "");
            const header = 'Authorization: MediaBrowser Client="IINA%20Jellyfin%20Plugin"\\, '
                + 'Device="IINA"\\, DeviceId="device"\\, Version="3.0.0"\\, Token="token"';
            const headerOption = `http-header-fields=%${Buffer.byteLength(header)}%${header}`;
            expect(commands.map(command => command.args[1])).toEqual(["replace", "insert-next", "append"]);
            expect(commands[0].args).toEqual([
                handoff.url, "replace", "-1", `${headerOption},force-media-title=%18%Žluťoučký 🐝`
            ]);
            expect(commands[2].args[3]).toBe(headerOption);
            expect(changedProperties).toEqual([]);
            expect(() => player.loadReplacement({
                ...handoff, url: "https://another.example.test/video"
            }, "")).toThrow("Jellyfin playback must use the configured HTTPS server.");
        } finally {
            globalThis.iina = previousIina;
        }
    });
});
