import { describe, expect, test } from "bun:test";

import { resolvePlaylistIndex } from "./backdropSlideshow";

describe("backdrop slideshow position", () => {
    test("advances after a hover backdrop replaces the current slide", () => {
        expect(resolvePlaylistIndex(1, 4, true)).toBe(2);
        expect(resolvePlaylistIndex(3, 4, true)).toBe(0);
    });

    test("keeps its place for ordinary context updates", () => {
        expect(resolvePlaylistIndex(1, 4, false)).toBe(1);
        expect(resolvePlaylistIndex(-1, 4, true)).toBe(0);
    });
});
