import { describe, expect, test } from "bun:test";

import type { CardContext } from "./viewModels";
import { resolveCardSelection } from "./selection";

function context(type: string): CardContext {
    return {
        id: "item",
        name: "Item",
        type,
        resume: 0,
        context: { seriesId: "", seasonId: "", episodeIndex: null }
    };
}

describe("sidebar card selection", () => {
    test("always opens details for supported card types", () => {
        expect(resolveCardSelection(context("Series"))).toBe("open-series");
        expect(resolveCardSelection(context("Movie"))).toBe("open-movie");
        expect(resolveCardSelection(context("Episode"))).toBe("open-episode");
        expect(resolveCardSelection(context("Folder"))).toBeNull();
    });
});
