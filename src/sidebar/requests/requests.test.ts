import { describe, expect, test } from "bun:test";

import type { JellyfinBaseItem } from "../../jellyfin/types";
import type { SidebarRequestPort } from "./port";

import { getDefaultSeasonId } from "./details";
import { createHomeRequests, mergeItems } from "./home";
import { rankSearchResults } from "./search";

describe("sidebar request modules", () => {
    test("merges continue-watching sources without duplicate items", () => {
        expect(mergeItems(
            [{ Id: "resume" }, { Id: "duplicate" }],
            [{ Id: "duplicate" }, { Id: "next" }]
        ).map(item => item.Id)).toEqual(["resume", "duplicate", "next"]);
    });

    test("pages newest seasons, deduplicates series, and preserves newest order", async () => {
        const endpoints: string[] = [];
        const duplicatePage = Array.from({ length: 20 }, (_, index): JellyfinBaseItem => ({
            Id: `season-${index}`,
            Type: "Season",
            SeriesId: "series-a"
        }));
        const port: SidebarRequestPort = {
            async requestJson<T>(_method: string, endpoint: string): Promise<T | null> {
                endpoints.push(endpoint);
                if (endpoint.includes("includeItemTypes=Season") && endpoint.includes("startIndex=0")) {
                    return { Items: duplicatePage } as T;
                }
                if (endpoint.includes("includeItemTypes=Season") && endpoint.includes("startIndex=20")) {
                    return { Items: [
                        { Type: "Season", SeriesId: "series-b" },
                        { Type: "Season", ParentId: "series-c" }
                    ] } as T;
                }
                if (endpoint.includes("ids=series-a,series-b,series-c")) {
                    return { Items: [
                        { Id: "series-c", Type: "Series" },
                        { Id: "series-a", Type: "Series" },
                        { Id: "series-b", Type: "Series" }
                    ] } as T;
                }
                return (endpoint.startsWith("/Items/Latest") ? [] : { Items: [] }) as T;
            },
            async fetchItemDetails(): Promise<JellyfinBaseItem | null> {
                return null;
            }
        };

        const home = await createHomeRequests(port).load("user", 3);

        expect(home.recentSeries.map(item => item.Id)).toEqual([
            "series-a",
            "series-b",
            "series-c"
        ]);
        expect(endpoints.filter(endpoint => endpoint.includes("includeItemTypes=Season")))
            .toHaveLength(2);
    });

    test("prefers the season containing the next episode", () => {
        const seasons: JellyfinBaseItem[] = [
            { Id: "season-1", IndexNumber: 1 },
            { Id: "season-2", IndexNumber: 2 }
        ];
        expect(getDefaultSeasonId(seasons, { SeasonId: "season-2" })).toBe("season-2");
        expect(getDefaultSeasonId(seasons, null)).toBe("season-1");
    });

    test("ranks exact, prefix, word-prefix, and substring matches stably", () => {
        const items: JellyfinBaseItem[] = [
            { Id: "contains", Name: "Substation" },
            { Id: "word", Name: "North Station" },
            { Id: "prefix", Name: "Station Eleven" },
            { Id: "exact", Name: "Station" },
            { Id: "word-2", Name: "Old Station" }
        ];
        expect(rankSearchResults(items, "station").map(item => item.Id)).toEqual([
            "exact",
            "prefix",
            "word",
            "word-2",
            "contains"
        ]);
    });
});
