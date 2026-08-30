import { describe, expect, test } from "bun:test";

import type { CardContext } from "./viewModels";
import { resolveCardSelection } from "./selection";

function context(type: string, directPlay: boolean = false): CardContext {
    return {
        id: "item",
        name: "Item",
        type,
        resume: 0,
        directPlay,
        context: { seriesId: "", seasonId: "", episodeIndex: null }
    };
}

describe("sidebar card selection", () => {
    test("opens details for browsed videos and preserves explicit direct play", () => {
        expect(resolveCardSelection(context("Series"))).toBe("open-series");
        expect(resolveCardSelection(context("Movie"))).toBe("open-movie");
        expect(resolveCardSelection(context("Movie", true))).toBe("play");
        expect(resolveCardSelection(context("Episode"))).toBe("open-episode");
        expect(resolveCardSelection(context("Episode", true))).toBe("play");
    });
});
