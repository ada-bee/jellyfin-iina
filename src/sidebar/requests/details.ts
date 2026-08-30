import type { JellyfinBaseItem } from "../../jellyfin/types";

import {
    buildEpisodesEndpoint,
    buildSeasonsEndpoint,
    buildSeriesFirstEpisodeEndpoint,
    buildSeriesNextUpEndpoint
} from "../../jellyfin/endpoints";
import type { SidebarRequestPort } from "./port";

export interface SeriesDetailsData {
    details: JellyfinBaseItem | null;
    seasons: JellyfinBaseItem[];
    playbackItem: JellyfinBaseItem | null;
}

export interface DetailsRequests {
    loadItem(itemId: string): Promise<JellyfinBaseItem | null>;
    loadSeriesPlaybackItem(userId: string, seriesId: string): Promise<JellyfinBaseItem | null>;
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

    async function loadFirstEpisode(userId: string, seriesId: string): Promise<JellyfinBaseItem | null> {
        try {
            const endpoint = buildSeriesFirstEpisodeEndpoint(userId, seriesId);
            const data = await port.requestJson<{ Items?: JellyfinBaseItem[] }>("GET", endpoint);
            return (data?.Items || []).find(item => item.Type === "Episode") || null;
        } catch {
            return null;
        }
    }

    async function loadSeriesPlaybackItem(
        userId: string,
        seriesId: string
    ): Promise<JellyfinBaseItem | null> {
        return await loadNextUp(userId, seriesId) || await loadFirstEpisode(userId, seriesId);
    }

    return {
        loadItem: itemId => port.fetchItemDetails(itemId),
        loadSeriesPlaybackItem,

        async loadSeries(userId: string, seriesId: string): Promise<SeriesDetailsData> {
            const seasonsEndpoint = buildSeasonsEndpoint(userId, seriesId);
            const [details, playbackItem, seasonsData] = await Promise.all([
                port.fetchItemDetails(seriesId),
                loadSeriesPlaybackItem(userId, seriesId),
                port.requestJson<{ Items?: JellyfinBaseItem[] }>("GET", seasonsEndpoint)
            ]);
            return {
                details,
                playbackItem,
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
