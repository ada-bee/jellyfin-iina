import type { JellyfinBaseItem } from "../../jellyfin/types";

import { buildSearchEndpoint } from "../../jellyfin/endpoints";
import { isSupportedItem } from "./home";
import type { SidebarRequestPort } from "./port";

export interface SearchRequests {
    search(userId: string, query: string): Promise<JellyfinBaseItem[]>;
}

export function createSearchRequests(port: SidebarRequestPort): SearchRequests {
    return {
        async search(userId: string, query: string): Promise<JellyfinBaseItem[]> {
            const endpoint = buildSearchEndpoint(userId, query);
            const data = await port.requestJson<{ Items?: JellyfinBaseItem[] }>("GET", endpoint);
            return rankSearchResults((data?.Items || []).filter(isSupportedItem), query);
        }
    };
}

export function rankSearchResults(items: JellyfinBaseItem[], query: string): JellyfinBaseItem[] {
    const normalizedQuery = query.toLocaleLowerCase();
    return items
        .map((item, index) => ({ item, index, score: getSearchScore(item, normalizedQuery) }))
        .sort((left, right) => right.score - left.score || left.index - right.index)
        .map(result => result.item);
}

function getSearchScore(item: JellyfinBaseItem, query: string): number {
    const name = String(item.Name || "").toLocaleLowerCase();
    const seriesName = String(item.SeriesName || "").toLocaleLowerCase();
    return scoreSearchText(name, query) + Math.round(scoreSearchText(seriesName, query) * 0.45);
}

function scoreSearchText(value: string, query: string): number {
    if (!value || !query) {
        return 0;
    }
    if (value === query) {
        return 1000;
    }
    if (value.startsWith(query)) {
        return 800;
    }
    if (value.split(/\s+/).some(word => word.startsWith(query))) {
        return 650;
    }
    return value.includes(query) ? 500 : 0;
}
