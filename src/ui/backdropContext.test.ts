import { describe, expect, test } from "bun:test";

import { buildBackdropItemIds } from "./backdropContext";

describe("backdrop slideshow candidates", () => {
    test("uses series backdrops for episodes and removes duplicates", () => {
        const itemIds = buildBackdropItemIds([
            { Id: "episode-1", Type: "Episode", SeriesId: "series-1" },
            { Id: "episode-2", Type: "Episode", SeriesId: "series-1" },
            { Id: "movie-1", Type: "Movie" },
            { Id: "series-2", Type: "Series" }
        ], () => .999);

        expect(itemIds).toEqual(["series-1", "movie-1", "series-2"]);
    });
});
