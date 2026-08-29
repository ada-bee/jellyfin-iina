import type { JellyfinBaseItem } from "../../shared/jellyfin";

import { apiRequest } from "../api";
import {
    renderEmptyState,
    renderHomeSections,
    renderListCards,
    renderSearchResults,
    renderSeriesOverview,
    showError,
    showLoading,
    updateTitle,
    hideLoading
} from "../render";
import { state } from "../state";
import {
    buildEpisodesEndpoint,
    buildLatestItemsEndpoint,
    buildLibraryItemsEndpoint,
    buildNextUpItemsEndpoint,
    buildResumeItemsEndpoint,
    buildSearchEndpoint,
    buildSeasonsEndpoint,
    buildSeriesNextUpEndpoint
} from "../endpoints";
import { log } from "../utils";

let viewRequestId = 0;

export function cancelPendingViewRequest(): void {
    viewRequestId += 1;
}

async function fetchAndRenderLibraryItems(options: {
    libraryId: string;
    libraryName: string;
    collectionType: string;
    addBreadcrumb: boolean;
}): Promise<void> {
    const requestId = ++viewRequestId;
    updateTitle(options.libraryName);
    showLoading();

    try {
        const endpoint = buildLibraryItemsEndpoint(state.userId, options.libraryId, options.collectionType);
        const data = await apiRequest<{ Items?: JellyfinBaseItem[] }>("GET", endpoint);
        if (requestId !== viewRequestId) {
            return;
        }
        const items = data?.Items || [];

        state.currentLibrary = {
            id: options.libraryId,
            name: options.libraryName,
            type: options.collectionType
        };
        state.lastAction = () => fetchAndRenderLibraryItems({
            libraryId: options.libraryId,
            libraryName: options.libraryName,
            collectionType: options.collectionType,
            addBreadcrumb: false
        });

        if (options.addBreadcrumb) {
            const breadcrumb = {
                type: "library" as const,
                id: options.libraryId,
                name: options.libraryName,
                collectionType: options.collectionType
            };
            if (!state.breadcrumb.find(entry => entry.id === breadcrumb.id)) {
                state.breadcrumb.push(breadcrumb);
            }
        }

        updateTitle(state.breadcrumb[state.breadcrumb.length - 1]?.name || options.libraryName);
        hideLoading();
        if (items.length === 0) {
            renderEmptyState("No items found");
            return;
        }
        renderListCards(items, { showSeriesName: false });
    } catch (error) {
        if (requestId !== viewRequestId) {
            return;
        }
        showError(error instanceof Error ? error.message : "Failed to load items");
    }
}

async function fetchAndRenderSeasons(options: {
    seriesId: string;
    seriesName: string;
    addBreadcrumb: boolean;
}): Promise<void> {
    const requestId = ++viewRequestId;
    updateTitle(options.seriesName);
    showLoading();

    try {
        const [nextUpItem, seasons] = await Promise.all([
            loadNextUpForSeries(options.seriesId),
            fetchSeasons(options.seriesId)
        ]);
        if (requestId !== viewRequestId) {
            return;
        }

        state.currentSeries = { id: options.seriesId, name: options.seriesName };
        state.lastAction = () => fetchAndRenderSeasons({
            seriesId: options.seriesId,
            seriesName: options.seriesName,
            addBreadcrumb: false
        });

        if (options.addBreadcrumb) {
            state.breadcrumb.push({ type: "series", id: options.seriesId, name: options.seriesName });
        }

        updateTitle(state.breadcrumb[state.breadcrumb.length - 1]?.name || options.seriesName);
        hideLoading();
        if (seasons.length === 0 && !nextUpItem) {
            renderEmptyState("No seasons found");
            return;
        }
        renderSeriesOverview(nextUpItem, seasons);
    } catch (error) {
        if (requestId !== viewRequestId) {
            return;
        }
        showError(error instanceof Error ? error.message : "Failed to load seasons");
    }
}

async function fetchAndRenderEpisodes(options: {
    seriesId: string;
    seasonId: string;
    seasonName: string;
    addBreadcrumb: boolean;
}): Promise<void> {
    const requestId = ++viewRequestId;
    updateTitle(options.seasonName);
    showLoading();

    try {
        const endpoint = buildEpisodesEndpoint(state.userId, options.seriesId, options.seasonId);
        const data = await apiRequest<{ Items?: JellyfinBaseItem[] }>("GET", endpoint);
        if (requestId !== viewRequestId) {
            return;
        }
        const episodes = data?.Items || [];

        state.currentSeason = { id: options.seasonId, name: options.seasonName };
        state.lastAction = () => fetchAndRenderEpisodes({
            seriesId: options.seriesId,
            seasonId: options.seasonId,
            seasonName: options.seasonName,
            addBreadcrumb: false
        });

        if (options.addBreadcrumb) {
            state.breadcrumb.push({
                type: "season",
                id: options.seasonId,
                seriesId: options.seriesId,
                name: options.seasonName
            });
        }

        updateTitle(state.breadcrumb[state.breadcrumb.length - 1]?.name || options.seasonName);
        hideLoading();
        if (episodes.length === 0) {
            renderEmptyState("No episodes found");
            return;
        }
        renderListCards(episodes, {
            showSeriesName: false,
            showEpisodeNumber: true,
            useEpisodeThumbnail: true
        });
    } catch (error) {
        if (requestId !== viewRequestId) {
            return;
        }
        showError(error instanceof Error ? error.message : "Failed to load episodes");
    }
}

export async function reloadItems(breadcrumb: {
    id: string;
    name: string;
    collectionType: string;
}): Promise<void> {
    await fetchAndRenderLibraryItems({
        libraryId: breadcrumb.id,
        libraryName: breadcrumb.name,
        collectionType: breadcrumb.collectionType,
        addBreadcrumb: false
    });
}

export async function reloadSeasons(breadcrumb: { id: string; name: string }): Promise<void> {
    await fetchAndRenderSeasons({
        seriesId: breadcrumb.id,
        seriesName: breadcrumb.name,
        addBreadcrumb: false
    });
}

export async function reloadEpisodes(breadcrumb: {
    id: string;
    name: string;
    seriesId: string;
}): Promise<void> {
    await fetchAndRenderEpisodes({
        seriesId: breadcrumb.seriesId,
        seasonId: breadcrumb.id,
        seasonName: breadcrumb.name,
        addBreadcrumb: false
    });
}

export async function loadHome(): Promise<void> {
    const requestId = ++viewRequestId;
    state.breadcrumb = [];
    state.lastAction = loadHome;
    updateTitle("Home");
    showLoading();

    try {
        const [nextUpItems, recentMovies, recentEpisodes] = await Promise.all([
            loadHomeItems(5),
            loadLatestItems("Movie", 5),
            loadLatestItems("Episode", 5)
        ]);
        if (requestId !== viewRequestId) {
            return;
        }
        renderHomeSections(nextUpItems, recentMovies, recentEpisodes);
        hideLoading();
    } catch (error) {
        if (requestId !== viewRequestId) {
            return;
        }
        showError(error instanceof Error ? error.message : "Failed to load items");
    }
}

async function loadHomeItems(limit: number = 5): Promise<JellyfinBaseItem[]> {
    const resumeItems = await loadResumeItems();
    const nextUpItems = await loadNextUpItems();
    const combined = mergeItems(resumeItems, nextUpItems);
    return combined.slice(0, limit);
}

async function loadLatestItems(itemType: string, limit: number): Promise<JellyfinBaseItem[]> {
    const endpoint = buildLatestItemsEndpoint(state.userId, itemType, limit);
    const data = await apiRequest<JellyfinBaseItem[]>("GET", endpoint);
    return (data || []).filter(item => isSupportedItem(item));
}

async function loadResumeItems(): Promise<JellyfinBaseItem[]> {
    const endpoint = buildResumeItemsEndpoint(state.userId);
    const data = await apiRequest<{ Items?: JellyfinBaseItem[] }>("GET", endpoint);
    return (data?.Items || []).filter(item => isSupportedItem(item));
}

async function loadNextUpItems(): Promise<JellyfinBaseItem[]> {
    const endpoint = buildNextUpItemsEndpoint(state.userId);
    const data = await apiRequest<{ Items?: JellyfinBaseItem[] }>("GET", endpoint);
    return (data?.Items || []).filter(item => isSupportedItem(item));
}

function mergeItems(primary: JellyfinBaseItem[], secondary: JellyfinBaseItem[]): JellyfinBaseItem[] {
    const seen = new Set<string>();
    const combined: JellyfinBaseItem[] = [];

    primary.forEach(item => {
        if (item && item.Id && !seen.has(item.Id)) {
            seen.add(item.Id);
            combined.push(item);
        }
    });

    secondary.forEach(item => {
        if (item && item.Id && !seen.has(item.Id)) {
            seen.add(item.Id);
            combined.push(item);
        }
    });

    return combined;
}

function isSupportedItem(item: JellyfinBaseItem | null | undefined): boolean {
    return Boolean(item && (item.Type === "Movie" || item.Type === "Episode" || item.Type === "Series"));
}

export async function loadItems(
    libraryId: string,
    libraryName: string,
    collectionType: string
): Promise<void> {
    await fetchAndRenderLibraryItems({
        libraryId,
        libraryName,
        collectionType,
        addBreadcrumb: true
    });
}

export async function loadSeasons(seriesId: string, seriesName: string): Promise<void> {
    await fetchAndRenderSeasons({
        seriesId,
        seriesName,
        addBreadcrumb: true
    });
}

export async function loadEpisodes(seriesId: string, seasonId: string, seasonName: string): Promise<void> {
    await fetchAndRenderEpisodes({
        seriesId,
        seasonId,
        seasonName,
        addBreadcrumb: true
    });
}

export async function performSearch(query: string): Promise<void> {
    const requestId = ++viewRequestId;
    state.lastAction = () => performSearch(query);
    updateTitle("Search Results");
    showLoading();

    try {
        const endpoint = buildSearchEndpoint(state.userId, query);
        const data = await apiRequest<{ Items?: JellyfinBaseItem[] }>("GET", endpoint);
        if (requestId !== viewRequestId || state.searchQuery !== query) {
            return;
        }
        const items = rankSearchResults(
            (data?.Items || []).filter(item => isSupportedItem(item)),
            query
        );

        hideLoading();
        if (items.length === 0) {
            renderEmptyState("No results found");
            return;
        }
        renderSearchResults(items);
    } catch (error) {
        if (requestId !== viewRequestId || state.searchQuery !== query) {
            return;
        }
        showError(error instanceof Error ? error.message : "Failed to search");
    }
}

function rankSearchResults(items: JellyfinBaseItem[], query: string): JellyfinBaseItem[] {
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

async function fetchSeasons(seriesId: string): Promise<JellyfinBaseItem[]> {
    const endpoint = buildSeasonsEndpoint(state.userId, seriesId);
    const data = await apiRequest<{ Items?: JellyfinBaseItem[] }>("GET", endpoint);
    return data?.Items || [];
}

async function loadNextUpForSeries(seriesId: string): Promise<JellyfinBaseItem | null> {
    try {
        const endpoint = buildSeriesNextUpEndpoint(state.userId, seriesId);
        const data = await apiRequest<{ Items?: JellyfinBaseItem[] }>("GET", endpoint);
        const items = (data?.Items || []).filter(item => item.Type === "Episode");
        return items[0] || null;
    } catch (error) {
        log("Failed to load series next up:", error instanceof Error ? error.message : error);
        return null;
    }
}
