import { describe, expect, test } from "bun:test";

import {
    buildItemDetailsEndpoint,
    buildLatestItemsEndpoint,
    buildLibraryItemsEndpoint,
    buildResumeItemsEndpoint,
    buildSearchEndpoint,
    buildSeriesFirstEpisodeEndpoint,
    buildSeriesNextUpEndpoint
} from "./endpoints";

function parseEndpoint(endpoint: string): URL {
    return new URL(endpoint, "https://media.example.test");
}

describe("Jellyfin 12 item endpoints", () => {
    test("uses the canonical item collection route", () => {
        const url = parseEndpoint(buildLibraryItemsEndpoint("user/id", "library/id", "movies"));

        expect(url.pathname).toBe("/Items");
        expect(url.searchParams.get("userId")).toBe("user/id");
        expect(url.searchParams.get("parentId")).toBe("library/id");
        expect(url.searchParams.get("includeItemTypes")).toBe("Movie");
    });

    test("uses canonical latest and resume routes", () => {
        expect(parseEndpoint(buildLatestItemsEndpoint("user-id", "Episode", 5)).pathname)
            .toBe("/Items/Latest");
        expect(parseEndpoint(buildResumeItemsEndpoint("user-id")).pathname)
            .toBe("/UserItems/Resume");
    });

    test("gets item details through the item route with user context", () => {
        const url = parseEndpoint(buildItemDetailsEndpoint("user/id", "item/id", "Overview"));

        expect(url.pathname).toBe("/Items/item%2Fid");
        expect(url.searchParams.get("userId")).toBe("user/id");
        expect(url.searchParams.get("fields")).toBe("Overview");
    });

    test("selects resumable next-up episodes and provides a first-episode fallback", () => {
        const nextUp = parseEndpoint(buildSeriesNextUpEndpoint("user/id", "series/id"));
        expect(nextUp.pathname).toBe("/Shows/NextUp");
        expect(nextUp.searchParams.get("seriesId")).toBe("series/id");
        expect(nextUp.searchParams.get("enableResumable")).toBe("true");
        expect(nextUp.searchParams.get("disableFirstEpisode")).toBe("true");

        const first = parseEndpoint(buildSeriesFirstEpisodeEndpoint("user/id", "series/id"));
        expect(first.pathname).toBe("/Shows/series%2Fid/Episodes");
        expect(first.searchParams.get("startIndex")).toBe("0");
        expect(first.searchParams.get("limit")).toBe("1");
    });

    test("encodes search input without changing the canonical route", () => {
        const url = parseEndpoint(buildSearchEndpoint("user-id", "show & film"));

        expect(url.pathname).toBe("/Items");
        expect(url.searchParams.get("searchTerm")).toBe("show & film");
        expect(url.searchParams.get("limit")).toBe("60");
    });
});
