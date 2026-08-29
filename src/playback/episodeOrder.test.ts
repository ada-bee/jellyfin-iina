import { describe, expect, test } from "bun:test";

import type { JellyfinBaseItem } from "../jellyfin/types";

import {
    findFirstEpisodeInSeason,
    findNextEpisodeInSeason,
    getFollowingSeasons
} from "./episodeOrder";

function item(id: string, index?: number): JellyfinBaseItem {
    return {
        Id: id,
        IndexNumber: index
    };
}

describe("autoplay episode ordering", () => {
    test("chooses the next available episode when numbering has a gap", () => {
        const episodes = [item("episode-4", 4), item("episode-1", 1), item("episode-3", 3)];

        expect(findNextEpisodeInSeason(episodes, 1)?.Id).toBe("episode-3");
    });

    test("does not replay the current episode", () => {
        expect(findNextEpisodeInSeason([item("episode-1", 1)], 1)).toBeNull();
    });

    test("chooses the earliest indexed episode in a new season", () => {
        const episodes = [item("episode-3", 3), item("episode-1", 1), item("unknown")];

        expect(findFirstEpisodeInSeason(episodes)?.Id).toBe("episode-1");
    });

    test("returns every later season in index order", () => {
        const seasons = [item("season-3", 3), item("season-1", 1), item("season-2", 2)];

        expect(getFollowingSeasons(seasons, "season-1").map((season) => season.Id))
            .toEqual(["season-2", "season-3"]);
    });
});
