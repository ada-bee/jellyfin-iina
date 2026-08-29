import { describe, expect, test } from "bun:test";

import { resolveBackdropSources } from "./presentation";

describe("backdrop presentation sources", () => {
    test("uses browsing slides and hover only in browse mode", () => {
        expect(resolveBackdropSources("browse", "playing", ["one", "two"], "hovered"))
            .toEqual({ itemIds: ["one", "two"], overrideItemId: "hovered" });
    });

    test("uses only the active item while paused", () => {
        expect(resolveBackdropSources("paused", "playing", ["one", "two"], "hovered"))
            .toEqual({ itemIds: ["playing"], overrideItemId: "" });
    });

    test("uses no sources while hidden", () => {
        expect(resolveBackdropSources("hidden", "playing", ["one"], "hovered"))
            .toEqual({ itemIds: [], overrideItemId: "" });
    });
});
