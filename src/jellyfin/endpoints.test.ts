import { describe, expect, test } from "bun:test";

import {
    buildItemDetailsEndpoint,
    buildLatestItemsEndpoint,
    buildLibraryItemsEndpoint,
    buildResumeItemsEndpoint,
    buildSearchEndpoint
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

    test("encodes search input without changing the canonical route", () => {
        const url = parseEndpoint(buildSearchEndpoint("user-id", "show & film"));

        expect(url.pathname).toBe("/Items");
        expect(url.searchParams.get("searchTerm")).toBe("show & film");
    });
});
