import type { JellyfinBaseItem } from "../../shared/jellyfin";

import { apiRequest } from "../api";
import {
    appendLibraryGridItems,
    renderEmptyState,
    renderHomeSections,
    renderLibraryGrid,
    renderListCards,
    renderSearchResults,
    renderSeriesOverview,
    showLibraryGridLoadError,
    showError,
    showLoading,
    updateTitle,
    hideLoading
} from "../render";
import { state, type LibraryState } from "../state";
import {
    buildEpisodesEndpoint,
    buildItemsByIdsEndpoint,
    buildLatestItemsEndpoint,
    buildLibraryItemsEndpoint,
    buildNewestSeasonsEndpoint,
    buildNextUpItemsEndpoint,
    buildResumeItemsEndpoint,
    buildSearchEndpoint,
    buildSeasonsEndpoint,
    buildSeriesNextUpEndpoint
} from "../endpoints";
import { log } from "../utils";

let viewRequestId = 0;
const LIBRARY_PAGE_SIZE = 60;
const homeViewCache = new Map<string, HomeViewData>();
const libraryViewCache = new Map<string, LibraryState>();

interface LibraryLoadOptions {
    libraryId: string;
    libraryName: string;
    collectionType: string;
    addBreadcrumb: boolean;
}

interface HomeViewData {
    continueWatchingItems: JellyfinBaseItem[];
    newestEpisodes: JellyfinBaseItem[];
    recentMovies: JellyfinBaseItem[];
    recentSeries: JellyfinBaseItem[];
}

export function cancelPendingViewRequest(): void {
    viewRequestId += 1;
}

async function fetchAndRenderLibraryItems(options: LibraryLoadOptions): Promise<void> {
    const cacheKey = getLibraryCacheKey(options.libraryId, options.collectionType);
    const cachedLibrary = libraryViewCache.get(cacheKey);
    if (cachedLibrary) {
        viewRequestId += 1;
        setCurrentLibraryContext(cachedLibrary, options);
        state.lastAction = () => fetchAndRenderLibraryItems({ ...options, addBreadcrumb: false });
        updateTitle(options.libraryName);
        hideLoading();
        if (cachedLibrary.items.length === 0) {
            renderEmptyState("No items found");
        } else {
            renderLibraryGrid(cachedLibrary.items, cachedLibrary.hasMore, loadMoreLibraryItems);
        }
        restoreLibraryScrollPosition(cachedLibrary.scrollTop);
        return;
    }

    const requestId = ++viewRequestId;
    const library: LibraryState = {
        id: options.libraryId,
        name: options.libraryName,
        type: options.collectionType,
        items: [] as JellyfinBaseItem[],
        totalItemCount: 0,
        hasMore: false,
        isLoadingMore: false,
        scrollTop: 0
    };
    setCurrentLibraryContext(library, options);

    updateTitle(options.libraryName);
    state.lastAction = () => fetchAndRenderLibraryItems({ ...options, addBreadcrumb: false });
    showLoading();

    try {
        const endpoint = buildLibraryItemsEndpoint(
            state.userId,
            options.libraryId,
            options.collectionType,
            0,
            LIBRARY_PAGE_SIZE
        );
        const data = await apiRequest<{
            Items?: JellyfinBaseItem[];
            TotalRecordCount?: number;
        }>("GET", endpoint);
        if (requestId !== viewRequestId) {
            return;
        }
        const items = data?.Items || [];
        const totalItemCount = data?.TotalRecordCount ?? items.length;
        library.items = items;
        library.totalItemCount = totalItemCount;
        library.hasMore = data?.TotalRecordCount === undefined
            ? items.length === LIBRARY_PAGE_SIZE
            : items.length < totalItemCount;
        libraryViewCache.set(cacheKey, library);
        state.lastAction = () => fetchAndRenderLibraryItems({
            libraryId: options.libraryId,
            libraryName: options.libraryName,
            collectionType: options.collectionType,
            addBreadcrumb: false
        });

        updateTitle(state.breadcrumb[state.breadcrumb.length - 1]?.name || options.libraryName);
        hideLoading();
        if (items.length === 0) {
            renderEmptyState("No items found");
            return;
        }
        renderLibraryGrid(items, library.hasMore, loadMoreLibraryItems);
        restoreLibraryScrollPosition(0);
    } catch (error) {
        if (requestId !== viewRequestId) {
            return;
        }
        showError(error instanceof Error ? error.message : "Failed to load items");
    }
}

function setCurrentLibraryContext(library: LibraryState, options: LibraryLoadOptions): void {
    state.currentLibrary = library;
    state.currentSeries = null;
    state.currentSeason = null;
    if (options.addBreadcrumb) {
        state.breadcrumb = [{
            type: "library",
            id: options.libraryId,
            name: options.libraryName,
            collectionType: options.collectionType
        }];
    }
}

async function loadMoreLibraryItems(): Promise<void> {
    const library = state.currentLibrary;
    if (!library || library.isLoadingMore || !library.hasMore || !isCurrentLibraryView()) {
        return;
    }

    library.isLoadingMore = true;
    try {
        const endpoint = buildLibraryItemsEndpoint(
            state.userId,
            library.id,
            library.type,
            library.items.length,
            LIBRARY_PAGE_SIZE
        );
        const data = await apiRequest<{
            Items?: JellyfinBaseItem[];
            TotalRecordCount?: number;
        }>("GET", endpoint);
        if (library !== state.currentLibrary || !isCurrentLibraryView()) {
            return;
        }

        const knownIds = new Set(library.items.map(item => item.Id).filter(Boolean));
        const newItems = (data?.Items || []).filter(item => !item.Id || !knownIds.has(item.Id));
        library.items.push(...newItems);
        library.totalItemCount = data?.TotalRecordCount ?? library.items.length;
        library.hasMore = newItems.length > 0 && (
            data?.TotalRecordCount === undefined
                ? (data?.Items || []).length === LIBRARY_PAGE_SIZE
                : library.items.length < library.totalItemCount
        );
        appendLibraryGridItems(newItems, library.hasMore);
    } catch {
        if (library === state.currentLibrary && isCurrentLibraryView()) {
            showLibraryGridLoadError(() => void loadMoreLibraryItems());
        }
    } finally {
        library.isLoadingMore = false;
    }
}

export function saveCurrentLibraryScrollPosition(): void {
    if (state.currentLibrary && isCurrentLibraryView(true)) {
        state.currentLibrary.scrollTop = window.scrollY;
    }
}

function restoreLibraryScrollPosition(scrollTop: number): void {
    requestAnimationFrame(() => window.scrollTo(0, scrollTop));
}

function isCurrentLibraryView(ignoreSearch: boolean = false): boolean {
    const current = state.breadcrumb[state.breadcrumb.length - 1];
    return current?.type === "library" && (ignoreSearch || !state.searchQuery);
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

export async function loadHome(forceReload: boolean = false): Promise<void> {
    const requestId = ++viewRequestId;
    state.breadcrumb = [];
    state.currentLibrary = null;
    state.currentSeries = null;
    state.currentSeason = null;
    state.lastAction = () => loadHome(true);
    updateTitle("Home");
    const cacheKey = getSessionCacheKey();
    const cachedHome = forceReload ? undefined : homeViewCache.get(cacheKey);
    if (cachedHome) {
        hideLoading();
        renderHomeSections(
            cachedHome.continueWatchingItems,
            cachedHome.newestEpisodes,
            cachedHome.recentMovies,
            cachedHome.recentSeries
        );
        return;
    }

    showLoading();

    try {
        const [continueWatchingItems, newestEpisodes, recentMovies, recentSeries] = await Promise.all([
            loadHomeItems(5),
            loadLatestItems("Episode", 5),
            loadLatestItems("Movie", 5),
            loadSeriesWithNewestSeasons(5)
        ]);
        if (requestId !== viewRequestId) {
            return;
        }
        homeViewCache.set(cacheKey, {
            continueWatchingItems,
            newestEpisodes,
            recentMovies,
            recentSeries
        });
        renderHomeSections(continueWatchingItems, newestEpisodes, recentMovies, recentSeries);
        hideLoading();
    } catch (error) {
        if (requestId !== viewRequestId) {
            return;
        }
        showError(error instanceof Error ? error.message : "Failed to load items");
    }
}

function getSessionCacheKey(): string {
    return `${state.serverUrl}\u0000${state.userId}`;
}

function getLibraryCacheKey(libraryId: string, collectionType: string): string {
    return `${getSessionCacheKey()}\u0000${collectionType}\u0000${libraryId}`;
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

async function loadSeriesWithNewestSeasons(limit: number): Promise<JellyfinBaseItem[]> {
    const pageSize = 20;
    const maximumSeasonRecords = 100;
    const seriesIds: string[] = [];
    const seen = new Set<string>();

    for (let startIndex = 0; startIndex < maximumSeasonRecords; startIndex += pageSize) {
        const endpoint = buildNewestSeasonsEndpoint(state.userId, startIndex, pageSize);
        const data = await apiRequest<{ Items?: JellyfinBaseItem[] }>("GET", endpoint);
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

    const endpoint = buildItemsByIdsEndpoint(state.userId, seriesIds, "Series");
    const data = await apiRequest<{ Items?: JellyfinBaseItem[] }>("GET", endpoint);
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
    window.scrollTo(0, 0);

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
