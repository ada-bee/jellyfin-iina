import type { JellyfinBaseItem } from "../../shared/jellyfin";

import { apiRequest, fetchItemDetails } from "../api";
import {
    appendLibraryGridItems,
    renderEmptyState,
    renderHomeSections,
    renderLibraryGrid,
    renderMovieDetails,
    renderSearchResults,
    renderSeriesDetails,
    renderSeriesEpisodes,
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
const HOME_SECTION_ITEM_LIMIT = 8;
const homeViewCache = new Map<string, HomeViewData>();
const libraryViewCache = new Map<string, LibraryState>();
const movieDetailsCache = new Map<string, JellyfinBaseItem>();
const seriesDetailsCache = new Map<string, SeriesViewData>();
let currentSeriesView: SeriesViewData | null = null;
let seriesSeasonRequestId = 0;

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

interface SeriesViewData {
    details: JellyfinBaseItem;
    seasons: JellyfinBaseItem[];
    nextUpItem: JellyfinBaseItem | null;
    selectedSeasonId: string;
    episodesBySeason: Map<string, JellyfinBaseItem[]>;
}

export function cancelPendingViewRequest(): void {
    viewRequestId += 1;
    seriesSeasonRequestId += 1;
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
    currentSeriesView = null;
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

async function fetchAndRenderMovieDetails(options: {
    movieId: string;
    movieName: string;
    addBreadcrumb: boolean;
}): Promise<void> {
    currentSeriesView = null;
    state.currentSeries = null;
    if (options.addBreadcrumb) {
        const current = state.breadcrumb[state.breadcrumb.length - 1];
        if (current?.type !== "movie" || current.id !== options.movieId) {
            state.breadcrumb.push({ type: "movie", id: options.movieId, name: options.movieName });
        }
    }

    const requestId = ++viewRequestId;
    const cacheKey = `${getSessionCacheKey()}\u0000movie\u0000${options.movieId}`;
    const cachedMovie = movieDetailsCache.get(cacheKey);
    state.lastAction = () => fetchAndRenderMovieDetails({ ...options, addBreadcrumb: false });
    updateTitle(options.movieName);
    window.scrollTo(0, 0);

    if (cachedMovie) {
        hideLoading();
        renderMovieDetails(cachedMovie);
        return;
    }

    showLoading();
    try {
        const movie = await fetchItemDetails(options.movieId);
        if (requestId !== viewRequestId) {
            return;
        }
        if (!movie) {
            throw new Error("Movie details are unavailable");
        }
        movieDetailsCache.set(cacheKey, movie);
        updateTitle(String(movie.Name || options.movieName));
        hideLoading();
        renderMovieDetails(movie);
    } catch (error) {
        if (requestId !== viewRequestId) {
            return;
        }
        showError(error instanceof Error ? error.message : "Failed to load movie details");
    }
}

async function fetchAndRenderSeriesDetails(options: {
    seriesId: string;
    seriesName: string;
    addBreadcrumb: boolean;
}): Promise<void> {
    if (options.addBreadcrumb) {
        const current = state.breadcrumb[state.breadcrumb.length - 1];
        if (current?.type !== "series" || current.id !== options.seriesId) {
            state.breadcrumb.push({ type: "series", id: options.seriesId, name: options.seriesName });
        }
    }

    const requestId = ++viewRequestId;
    const cacheKey = getSeriesDetailsCacheKey(options.seriesId);
    updateTitle(options.seriesName);
    window.scrollTo(0, 0);
    state.lastAction = () => fetchAndRenderSeriesDetails({ ...options, addBreadcrumb: false });

    const cachedSeries = seriesDetailsCache.get(cacheKey);
    if (cachedSeries) {
        setCurrentSeriesView(cachedSeries);
        hideLoading();
        renderSeriesView(cachedSeries, getSeriesEpisodeLoadState(cachedSeries), 0);
        if (cachedSeries.selectedSeasonId && !cachedSeries.episodesBySeason.has(cachedSeries.selectedSeasonId)) {
            void loadSeriesSeason(cachedSeries, cachedSeries.selectedSeasonId, 0, false);
        }
        return;
    }

    showLoading();
    try {
        const [details, nextUpItem, seasons] = await Promise.all([
            fetchItemDetails(options.seriesId),
            loadNextUpForSeries(options.seriesId),
            fetchSeasons(options.seriesId)
        ]);
        if (requestId !== viewRequestId) {
            return;
        }
        if (!details) {
            throw new Error("Series details are unavailable");
        }
        const view: SeriesViewData = {
            details,
            seasons,
            nextUpItem,
            selectedSeasonId: getDefaultSeasonId(seasons, nextUpItem),
            episodesBySeason: new Map<string, JellyfinBaseItem[]>()
        };
        seriesDetailsCache.set(cacheKey, view);
        setCurrentSeriesView(view);
        updateTitle(String(details.Name || options.seriesName));
        hideLoading();
        if (view.selectedSeasonId) {
            renderSeriesView(view, "loading", 0);
            void loadSeriesSeason(view, view.selectedSeasonId, 0, false);
        } else {
            renderSeriesView(view, "ready", 0);
        }
    } catch (error) {
        if (requestId !== viewRequestId) {
            return;
        }
        showError(error instanceof Error ? error.message : "Failed to load series details");
    }
}

async function loadSeriesSeason(
    view: SeriesViewData,
    seasonId: string,
    scrollTop: number,
    forceReload: boolean
): Promise<void> {
    view.selectedSeasonId = seasonId;
    if (state.currentSeries) {
        state.currentSeries.selectedSeasonId = seasonId;
    }
    const cachedEpisodes = forceReload ? undefined : view.episodesBySeason.get(seasonId);
    if (cachedEpisodes) {
        renderSeriesSeason(view, "ready", scrollTop);
        return;
    }

    const requestId = ++seriesSeasonRequestId;
    renderSeriesSeason(view, "loading", scrollTop);
    try {
        const endpoint = buildEpisodesEndpoint(state.userId, view.details.Id || "", seasonId);
        const data = await apiRequest<{ Items?: JellyfinBaseItem[] }>("GET", endpoint);
        if (
            requestId !== seriesSeasonRequestId ||
            currentSeriesView !== view ||
            view.selectedSeasonId !== seasonId
        ) {
            return;
        }
        view.episodesBySeason.set(seasonId, data?.Items || []);
        renderSeriesSeason(view, "ready", scrollTop);
    } catch {
        if (requestId !== seriesSeasonRequestId || currentSeriesView !== view) {
            return;
        }
        renderSeriesSeason(view, "error", scrollTop);
    }
}

function setCurrentSeriesView(view: SeriesViewData): void {
    currentSeriesView = view;
    state.currentSeries = {
        id: view.details.Id || "",
        name: String(view.details.Name || "Series"),
        selectedSeasonId: view.selectedSeasonId
    };
}

function getDefaultSeasonId(seasons: JellyfinBaseItem[], nextUpItem: JellyfinBaseItem | null): string {
    const nextUpSeasonId = nextUpItem?.SeasonId || nextUpItem?.ParentId || "";
    if (nextUpSeasonId && seasons.some(season => season.Id === nextUpSeasonId)) {
        return nextUpSeasonId;
    }
    return seasons.find(season => (season.IndexNumber || 0) > 0)?.Id || seasons[0]?.Id || "";
}

function getSeriesEpisodeLoadState(view: SeriesViewData): "ready" | "loading" {
    return !view.selectedSeasonId || view.episodesBySeason.has(view.selectedSeasonId) ? "ready" : "loading";
}

function renderSeriesView(
    view: SeriesViewData,
    loadState: "ready" | "loading" | "error",
    scrollTop: number
): void {
    renderSeriesDetails(
        view.details,
        view.seasons,
        view.selectedSeasonId,
        view.episodesBySeason.get(view.selectedSeasonId) || [],
        view.nextUpItem,
        loadState
    );
    requestAnimationFrame(() => window.scrollTo(0, scrollTop));
}

function renderSeriesSeason(
    view: SeriesViewData,
    loadState: "ready" | "loading" | "error",
    scrollTop: number
): void {
    const updated = renderSeriesEpisodes(
        view.seasons,
        view.selectedSeasonId,
        view.episodesBySeason.get(view.selectedSeasonId) || [],
        loadState
    );
    if (!updated) {
        renderSeriesView(view, loadState, scrollTop);
        return;
    }
    requestAnimationFrame(() => window.scrollTo(0, scrollTop));
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

export async function reloadSeriesDetails(breadcrumb: { id: string; name: string }): Promise<void> {
    await fetchAndRenderSeriesDetails({
        seriesId: breadcrumb.id,
        seriesName: breadcrumb.name,
        addBreadcrumb: false
    });
}

export async function loadHome(forceReload: boolean = false): Promise<void> {
    const requestId = ++viewRequestId;
    state.breadcrumb = [];
    state.currentLibrary = null;
    state.currentSeries = null;
    currentSeriesView = null;
    seriesSeasonRequestId += 1;
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
            loadHomeItems(),
            loadLatestItems("Episode", HOME_SECTION_ITEM_LIMIT),
            loadLatestItems("Movie", HOME_SECTION_ITEM_LIMIT),
            loadSeriesWithNewestSeasons(HOME_SECTION_ITEM_LIMIT)
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

function getSeriesDetailsCacheKey(seriesId: string): string {
    return `${getSessionCacheKey()}\u0000series\u0000${seriesId}`;
}

async function loadHomeItems(limit: number = HOME_SECTION_ITEM_LIMIT): Promise<JellyfinBaseItem[]> {
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

export async function loadSeriesDetails(seriesId: string, seriesName: string): Promise<void> {
    await fetchAndRenderSeriesDetails({
        seriesId,
        seriesName,
        addBreadcrumb: true
    });
}

export async function loadMovie(movieId: string, movieName: string): Promise<void> {
    await fetchAndRenderMovieDetails({ movieId, movieName, addBreadcrumb: true });
}

export async function reloadMovie(breadcrumb: { id: string; name: string }): Promise<void> {
    await fetchAndRenderMovieDetails({
        movieId: breadcrumb.id,
        movieName: breadcrumb.name,
        addBreadcrumb: false
    });
}

export async function selectSeriesSeason(seasonId: string): Promise<void> {
    const view = currentSeriesView;
    if (!view || !view.seasons.some(season => season.Id === seasonId)) {
        return;
    }
    await loadSeriesSeason(view, seasonId, window.scrollY, false);
}

export async function retrySelectedSeriesSeason(): Promise<void> {
    const view = currentSeriesView;
    if (!view?.selectedSeasonId) {
        return;
    }
    await loadSeriesSeason(view, view.selectedSeasonId, window.scrollY, true);
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
