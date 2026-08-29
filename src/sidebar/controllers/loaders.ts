import type { JellyfinBaseItem } from "../../jellyfin/types";

import { LatestRequest, RequestCache } from "../../sidebar/requests/coordinator";
import { getDefaultSeasonId } from "../../sidebar/requests/details";
import type { HomeViewData } from "../../sidebar/requests/home";
import { sidebarRequests } from "../../adapters/browser/sidebarRequests";
import { sidebarStore, state, type LibraryState } from "../../sidebar/store";
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
} from "../views";

const LIBRARY_PAGE_SIZE = 60;
const HOME_SECTION_ITEM_LIMIT = 8;
const viewRequests = new LatestRequest();
const libraryPageRequests = new LatestRequest();
const seriesSeasonRequests = new LatestRequest();
const homeViewCache = new RequestCache<HomeViewData>();
const libraryViewCache = new RequestCache<LibraryState>();
const movieDetailsCache = new RequestCache<JellyfinBaseItem>();
const seriesDetailsCache = new RequestCache<SeriesViewData>();
let currentSeriesView: SeriesViewData | null = null;

interface LibraryLoadOptions {
    libraryId: string;
    libraryName: string;
    collectionType: string;
    addBreadcrumb: boolean;
}

interface SeriesViewData {
    details: JellyfinBaseItem;
    seasons: JellyfinBaseItem[];
    nextUpItem: JellyfinBaseItem | null;
    selectedSeasonId: string;
    episodesBySeason: Map<string, JellyfinBaseItem[]>;
}

export function cancelPendingViewRequest(): void {
    viewRequests.cancel();
    libraryPageRequests.cancel();
    seriesSeasonRequests.cancel();
}

function beginViewRequest(): number {
    libraryPageRequests.cancel();
    seriesSeasonRequests.cancel();
    return viewRequests.begin();
}

export function clearSidebarRequestCaches(): void {
    homeViewCache.clear();
    libraryViewCache.clear();
    movieDetailsCache.clear();
    seriesDetailsCache.clear();
    currentSeriesView = null;
    cancelPendingViewRequest();
}

async function fetchAndRenderLibraryItems(options: LibraryLoadOptions): Promise<void> {
    libraryPageRequests.cancel();
    seriesSeasonRequests.cancel();
    const cacheKey = getLibraryCacheKey(options.libraryId, options.collectionType);
    sidebarStore.setRetryOperation({
        kind: "library",
        id: options.libraryId,
        name: options.libraryName,
        collectionType: options.collectionType
    });
    const cachedLibrary = libraryViewCache.get(cacheKey);
    if (cachedLibrary) {
        viewRequests.cancel();
        setCurrentLibraryContext(cachedLibrary, options);
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

    const requestId = beginViewRequest();
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
    showLoading();

    try {
        const page = await sidebarRequests.library.loadPage({
            userId: state.userId,
            libraryId: options.libraryId,
            collectionType: options.collectionType,
            startIndex: 0,
            limit: LIBRARY_PAGE_SIZE
        });
        if (!viewRequests.isCurrent(requestId)) {
            return;
        }
        const items = page.items;
        library.items = items;
        library.totalItemCount = page.totalItemCount;
        library.hasMore = page.hasMore;
        libraryViewCache.set(cacheKey, library);

        updateTitle(state.breadcrumb[state.breadcrumb.length - 1]?.name || options.libraryName);
        hideLoading();
        if (items.length === 0) {
            renderEmptyState("No items found");
            return;
        }
        renderLibraryGrid(items, library.hasMore, loadMoreLibraryItems);
        restoreLibraryScrollPosition(0);
    } catch (error) {
        if (!viewRequests.isCurrent(requestId)) {
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
        sidebarStore.navigateLibrary(options.libraryId, options.libraryName, options.collectionType);
    }
}

async function loadMoreLibraryItems(): Promise<void> {
    const library = state.currentLibrary;
    if (!library || library.isLoadingMore || !library.hasMore || !isCurrentLibraryView()) {
        return;
    }

    library.isLoadingMore = true;
    const requestId = libraryPageRequests.begin();
    try {
        const page = await sidebarRequests.library.loadPage({
            userId: state.userId,
            libraryId: library.id,
            collectionType: library.type,
            startIndex: library.items.length,
            limit: LIBRARY_PAGE_SIZE
        });
        if (
            !libraryPageRequests.isCurrent(requestId) ||
            library !== state.currentLibrary ||
            !isCurrentLibraryView()
        ) {
            return;
        }

        const knownIds = new Set(library.items.map(item => item.Id).filter(Boolean));
        const newItems = page.items.filter(item => !item.Id || !knownIds.has(item.Id));
        library.items.push(...newItems);
        library.totalItemCount = page.totalItemCount;
        library.hasMore = newItems.length > 0 && page.hasMore;
        appendLibraryGridItems(newItems, library.hasMore);
    } catch {
        if (
            libraryPageRequests.isCurrent(requestId) &&
            library === state.currentLibrary &&
            isCurrentLibraryView()
        ) {
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
        sidebarStore.navigateToDetails({ kind: "movie", id: options.movieId, name: options.movieName });
    }

    const requestId = beginViewRequest();
    const cacheKey = `${getSessionCacheKey()}\u0000movie\u0000${options.movieId}`;
    const cachedMovie = movieDetailsCache.get(cacheKey);
    sidebarStore.setRetryOperation({ kind: "movie", id: options.movieId, name: options.movieName });
    updateTitle(options.movieName);
    window.scrollTo(0, 0);

    if (cachedMovie) {
        hideLoading();
        renderMovieDetails(cachedMovie);
        return;
    }

    showLoading();
    try {
        const movie = await sidebarRequests.details.loadItem(options.movieId);
        if (!viewRequests.isCurrent(requestId)) {
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
        if (!viewRequests.isCurrent(requestId)) {
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
        sidebarStore.navigateToDetails({ kind: "series", id: options.seriesId, name: options.seriesName });
    }

    const requestId = beginViewRequest();
    const cacheKey = getSeriesDetailsCacheKey(options.seriesId);
    updateTitle(options.seriesName);
    window.scrollTo(0, 0);
    sidebarStore.setRetryOperation({ kind: "series", id: options.seriesId, name: options.seriesName });

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
        const { details, nextUpItem, seasons } = await sidebarRequests.details.loadSeries(
            state.userId,
            options.seriesId
        );
        if (!viewRequests.isCurrent(requestId)) {
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
        if (!viewRequests.isCurrent(requestId)) {
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

    const requestId = seriesSeasonRequests.begin();
    renderSeriesSeason(view, "loading", scrollTop);
    try {
        const episodes = await sidebarRequests.details.loadEpisodes(
            state.userId,
            view.details.Id || "",
            seasonId
        );
        if (
            !seriesSeasonRequests.isCurrent(requestId) ||
            currentSeriesView !== view ||
            view.selectedSeasonId !== seasonId
        ) {
            return;
        }
        view.episodesBySeason.set(seasonId, episodes);
        renderSeriesSeason(view, "ready", scrollTop);
    } catch {
        if (!seriesSeasonRequests.isCurrent(requestId) || currentSeriesView !== view) {
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
    const requestId = beginViewRequest();
    sidebarStore.navigateHome();
    state.currentLibrary = null;
    state.currentSeries = null;
    currentSeriesView = null;
    sidebarStore.setRetryOperation({ kind: "home", forceReload: true });
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
        const home = await sidebarRequests.home.load(state.userId, HOME_SECTION_ITEM_LIMIT);
        if (!viewRequests.isCurrent(requestId)) {
            return;
        }
        homeViewCache.set(cacheKey, home);
        renderHomeSections(
            home.continueWatchingItems,
            home.newestEpisodes,
            home.recentMovies,
            home.recentSeries
        );
        hideLoading();
    } catch (error) {
        if (!viewRequests.isCurrent(requestId)) {
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
    const requestId = beginViewRequest();
    sidebarStore.setRetryOperation({ kind: "search", query });
    updateTitle("Search Results");
    showLoading();
    window.scrollTo(0, 0);

    try {
        const items = await sidebarRequests.search.search(state.userId, query);
        if (!viewRequests.isCurrent(requestId) || state.searchQuery !== query) {
            return;
        }

        hideLoading();
        if (items.length === 0) {
            renderEmptyState("No results found");
            return;
        }
        renderSearchResults(items);
    } catch (error) {
        if (!viewRequests.isCurrent(requestId) || state.searchQuery !== query) {
            return;
        }
        showError(error instanceof Error ? error.message : "Failed to search");
    }
}
