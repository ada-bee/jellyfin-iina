import type { JellyfinBaseItem } from "../../jellyfin/types";

import {
    buildEpisodesEndpoint,
    buildSeasonsEndpoint,
    buildSeriesNextUpEndpoint
} from "../../jellyfin/endpoints";
import type { SidebarRequestPort } from "./port";

export interface SeriesDetailsData {
    details: JellyfinBaseItem | null;
    seasons: JellyfinBaseItem[];
    nextUpItem: JellyfinBaseItem | null;
}

export interface DetailsRequests {
    loadItem(itemId: string): Promise<JellyfinBaseItem | null>;
    loadSeries(userId: string, seriesId: string): Promise<SeriesDetailsData>;
    loadEpisodes(userId: string, seriesId: string, seasonId: string): Promise<JellyfinBaseItem[]>;
}

export function createDetailsRequests(port: SidebarRequestPort): DetailsRequests {
    async function loadNextUp(userId: string, seriesId: string): Promise<JellyfinBaseItem | null> {
        try {
            const endpoint = buildSeriesNextUpEndpoint(userId, seriesId);
            const data = await port.requestJson<{ Items?: JellyfinBaseItem[] }>("GET", endpoint);
            return (data?.Items || []).find(item => item.Type === "Episode") || null;
        } catch {
            return null;
        }
    }

    return {
        loadItem: itemId => port.fetchItemDetails(itemId),

        async loadSeries(userId: string, seriesId: string): Promise<SeriesDetailsData> {
            const seasonsEndpoint = buildSeasonsEndpoint(userId, seriesId);
            const [details, nextUpItem, seasonsData] = await Promise.all([
                port.fetchItemDetails(seriesId),
                loadNextUp(userId, seriesId),
                port.requestJson<{ Items?: JellyfinBaseItem[] }>("GET", seasonsEndpoint)
            ]);
            return {
                details,
                nextUpItem,
                seasons: seasonsData?.Items || []
            };
        },

        async loadEpisodes(userId: string, seriesId: string, seasonId: string): Promise<JellyfinBaseItem[]> {
            const endpoint = buildEpisodesEndpoint(userId, seriesId, seasonId);
            const data = await port.requestJson<{ Items?: JellyfinBaseItem[] }>("GET", endpoint);
            return data?.Items || [];
        }
    };
}

export function getDefaultSeasonId(
    seasons: JellyfinBaseItem[],
    nextUpItem: JellyfinBaseItem | null
): string {
    const nextUpSeasonId = nextUpItem?.SeasonId || nextUpItem?.ParentId || "";
    if (nextUpSeasonId && seasons.some(season => season.Id === nextUpSeasonId)) {
        return nextUpSeasonId;
    }
    return seasons.find(season => (season.IndexNumber || 0) > 0)?.Id || seasons[0]?.Id || "";
}
