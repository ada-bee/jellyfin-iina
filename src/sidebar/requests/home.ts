import type { JellyfinBaseItem } from "../../jellyfin/types";

import {
    buildItemsByIdsEndpoint,
    buildLatestItemsEndpoint,
    buildNewestSeasonsEndpoint,
    buildNextUpItemsEndpoint,
    buildResumeItemsEndpoint
} from "../../jellyfin/endpoints";
import type { SidebarRequestPort } from "./port";

export interface HomeViewData {
    continueWatchingItems: JellyfinBaseItem[];
    newestEpisodes: JellyfinBaseItem[];
    recentMovies: JellyfinBaseItem[];
    recentSeries: JellyfinBaseItem[];
}

export interface HomeRequests {
    load(userId: string, limit: number): Promise<HomeViewData>;
}

export function createHomeRequests(port: SidebarRequestPort): HomeRequests {
    async function loadLatestItems(userId: string, itemType: string, limit: number): Promise<JellyfinBaseItem[]> {
        const endpoint = buildLatestItemsEndpoint(userId, itemType, limit);
        const data = await port.requestJson<JellyfinBaseItem[]>("GET", endpoint);
        return (data || []).filter(isSupportedItem);
    }

    async function loadResumeItems(userId: string): Promise<JellyfinBaseItem[]> {
        const endpoint = buildResumeItemsEndpoint(userId);
        const data = await port.requestJson<{ Items?: JellyfinBaseItem[] }>("GET", endpoint);
        return (data?.Items || []).filter(isSupportedItem);
    }

    async function loadNextUpItems(userId: string): Promise<JellyfinBaseItem[]> {
        const endpoint = buildNextUpItemsEndpoint(userId);
        const data = await port.requestJson<{ Items?: JellyfinBaseItem[] }>("GET", endpoint);
        return (data?.Items || []).filter(isSupportedItem);
    }

    async function loadContinueWatching(userId: string, limit: number): Promise<JellyfinBaseItem[]> {
        const resumeItems = await loadResumeItems(userId);
        const nextUpItems = await loadNextUpItems(userId);
        return mergeItems(resumeItems, nextUpItems).slice(0, limit);
    }

    async function loadSeriesWithNewestSeasons(userId: string, limit: number): Promise<JellyfinBaseItem[]> {
        const pageSize = 20;
        const maximumSeasonRecords = 100;
        const seriesIds: string[] = [];
        const seen = new Set<string>();

        for (let startIndex = 0; startIndex < maximumSeasonRecords; startIndex += pageSize) {
            const endpoint = buildNewestSeasonsEndpoint(userId, startIndex, pageSize);
            const data = await port.requestJson<{ Items?: JellyfinBaseItem[] }>("GET", endpoint);
            const seasons = data?.Items || [];

            for (const season of seasons) {
                const seriesId = season.SeriesId || season.ParentId;
                if (seriesId && !seen.has(seriesId)) {
                    seen.add(seriesId);
                    seriesIds.push(seriesId);
                    if (seriesIds.length === limit) {
                        break;
                    }
                }
            }

            if (seriesIds.length === limit || seasons.length < pageSize) {
                break;
            }
        }

        if (seriesIds.length === 0) {
            return [];
        }

        const endpoint = buildItemsByIdsEndpoint(userId, seriesIds, "Series");
        const data = await port.requestJson<{ Items?: JellyfinBaseItem[] }>("GET", endpoint);
        const seriesById = new Map(
            (data?.Items || [])
                .filter(item => item.Id && item.Type === "Series")
                .map(item => [item.Id as string, item])
        );

        return seriesIds
            .map(seriesId => seriesById.get(seriesId))
            .filter((item): item is JellyfinBaseItem => Boolean(item))
            .slice(0, limit);
    }

    return {
        async load(userId: string, limit: number): Promise<HomeViewData> {
            const [continueWatchingItems, newestEpisodes, recentMovies, recentSeries] = await Promise.all([
                loadContinueWatching(userId, limit),
                loadLatestItems(userId, "Episode", limit),
                loadLatestItems(userId, "Movie", limit),
                loadSeriesWithNewestSeasons(userId, limit)
            ]);
            return { continueWatchingItems, newestEpisodes, recentMovies, recentSeries };
        }
    };
}

export function mergeItems(primary: JellyfinBaseItem[], secondary: JellyfinBaseItem[]): JellyfinBaseItem[] {
    const seen = new Set<string>();
    const combined: JellyfinBaseItem[] = [];
    for (const item of [...primary, ...secondary]) {
        if (item.Id && !seen.has(item.Id)) {
            seen.add(item.Id);
            combined.push(item);
        }
    }
    return combined;
}

export function isSupportedItem(item: JellyfinBaseItem | null | undefined): item is JellyfinBaseItem {
    return Boolean(item && (item.Type === "Movie" || item.Type === "Episode" || item.Type === "Series"));
}
