import { describe, expect, test } from "bun:test";

import { JELLYFIN_LIBRARY_HOST_URL } from "./constants";
import { IinaPlayer } from "./player";

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
});
