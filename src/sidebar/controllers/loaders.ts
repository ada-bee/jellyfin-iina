import type { JellyfinBaseItem } from "../../jellyfin/types";

import { LatestRequest, RequestCache } from "../../sidebar/requests/coordinator";
import type { HomeViewData } from "../../sidebar/requests/home";
import { sidebarRequests } from "../../adapters/browser/sidebarRequests";
import { sidebarStore, state, type LibraryState } from "../../sidebar/store";
import {
    appendLibraryGridItems,
    renderEmptyState,
    renderEpisodeDetails,
    renderHomeSections,
    renderLibraryGrid,
    renderMovieDetails,
    renderSearchResults,
    renderSeriesDetails,
    renderSeriesSeasons,
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
const playableDetailsCache = new RequestCache<JellyfinBaseItem>();
const seriesDetailsCache = new RequestCache<SeriesViewData>();
let currentSeriesView: SeriesViewData | null = null;

interface LibraryLoadOptions {
    libraryId: string;
    libraryName: string;
    collectionType: string;
    addBreadcrumb: boolean;
}

interface PlayableDetailsLoadOptions {
    kind: "movie" | "episode";
    itemId: string;
    itemName: string;
    addBreadcrumb: boolean;
}

interface SeriesViewData {
    details: JellyfinBaseItem;
    seasons: JellyfinBaseItem[];
    playbackItem: JellyfinBaseItem | null;
    expandedSeasonId: string;
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
    playableDetailsCache.clear();
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
    showLoading("library");

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

async function fetchAndRenderPlayableDetails(options: PlayableDetailsLoadOptions): Promise<void> {
    currentSeriesView = null;
    state.currentSeries = null;
    if (options.addBreadcrumb) {
        sidebarStore.navigateToDetails({
            kind: options.kind,
            id: options.itemId,
            name: options.itemName
        });
    }

    const requestId = beginViewRequest();
    const cacheKey = `${getSessionCacheKey()}\u0000${options.kind}\u0000${options.itemId}`;
    const cachedItem = playableDetailsCache.get(cacheKey);
    sidebarStore.setRetryOperation({ kind: options.kind, id: options.itemId, name: options.itemName });
    updateTitle(options.itemName);
    window.scrollTo(0, 0);

    if (cachedItem) {
        hideLoading();
        renderPlayableDetails(cachedItem, options.kind);
        return;
    }

    showLoading("details");
    try {
        const item = await sidebarRequests.details.loadItem(options.itemId);
        if (!viewRequests.isCurrent(requestId)) {
            return;
        }
        if (!item) {
            throw new Error(`${getPlayableKindLabel(options.kind)} details are unavailable`);
        }
        playableDetailsCache.set(cacheKey, item);
        updateTitle(String(item.Name || options.itemName));
        hideLoading();
        renderPlayableDetails(item, options.kind);
    } catch (error) {
        if (!viewRequests.isCurrent(requestId)) {
            return;
        }
        showError(error instanceof Error
            ? error.message
            : `Failed to load ${options.kind} details`);
    }
}

function renderPlayableDetails(item: JellyfinBaseItem, kind: "movie" | "episode"): void {
    if (kind === "episode") {
        renderEpisodeDetails(item);
        return;
    }
    renderMovieDetails(item);
}

function getPlayableKindLabel(kind: "movie" | "episode"): "Movie" | "Episode" {
    return kind === "movie" ? "Movie" : "Episode";
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
        cachedSeries.expandedSeasonId = "";
        setCurrentSeriesView(cachedSeries);
        hideLoading();
        renderSeriesView(cachedSeries, "ready", 0);
        return;
    }

    showLoading("details");
    try {
        const { details, playbackItem, seasons } = await sidebarRequests.details.loadSeries(
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
            playbackItem,
            expandedSeasonId: "",
            episodesBySeason: new Map<string, JellyfinBaseItem[]>()
        };
        seriesDetailsCache.set(cacheKey, view);
        setCurrentSeriesView(view);
        updateTitle(String(details.Name || options.seriesName));
        hideLoading();
        renderSeriesView(view, "ready", 0);
    } catch (error) {
        if (!viewRequests.isCurrent(requestId)) {
            return;
        }
        showError(error instanceof Error ? error.message : "Failed to load series details");
    }
}

async function expandSeriesSeason(
    view: SeriesViewData,
    seasonId: string,
    forceReload: boolean
): Promise<void> {
    setExpandedSeriesSeason(view, seasonId);
    const cachedEpisodes = forceReload ? undefined : view.episodesBySeason.get(seasonId);
    if (cachedEpisodes) {
        renderSeriesSeason(view, "ready", window.scrollY, true);
        return;
    }

    const requestId = seriesSeasonRequests.begin();
    renderSeriesSeason(view, "loading", window.scrollY, true);
    try {
        const episodes = await sidebarRequests.details.loadEpisodes(
            state.userId,
            view.details.Id || "",
            seasonId
        );
        if (
            !seriesSeasonRequests.isCurrent(requestId) ||
            currentSeriesView !== view ||
            view.expandedSeasonId !== seasonId
        ) {
            return;
        }
        view.episodesBySeason.set(seasonId, episodes);
        renderSeriesSeason(view, "ready", window.scrollY, true);
    } catch {
        if (!seriesSeasonRequests.isCurrent(requestId) || currentSeriesView !== view) {
            return;
        }
        renderSeriesSeason(view, "error", window.scrollY, true);
    }
}

function setExpandedSeriesSeason(view: SeriesViewData, seasonId: string): void {
    view.expandedSeasonId = seasonId;
    if (state.currentSeries) {
        state.currentSeries.expandedSeasonId = seasonId;
    }
}

function setCurrentSeriesView(view: SeriesViewData): void {
    currentSeriesView = view;
    state.currentSeries = {
        id: view.details.Id || "",
        name: String(view.details.Name || "Series"),
        expandedSeasonId: view.expandedSeasonId
    };
}

function renderSeriesView(
    view: SeriesViewData,
    loadState: "ready" | "loading" | "error",
    scrollTop: number
): void {
    renderSeriesDetails(
        view.details,
        view.seasons,
        view.expandedSeasonId,
        view.episodesBySeason.get(view.expandedSeasonId) || [],
        view.playbackItem,
        loadState
    );
    requestAnimationFrame(() => window.scrollTo(0, scrollTop));
}

function renderSeriesSeason(
    view: SeriesViewData,
    loadState: "ready" | "loading" | "error",
    scrollTop: number,
    scrollToExpandedSeason: boolean
): void {
    const updated = renderSeriesSeasons(
        view.seasons,
        view.expandedSeasonId,
        view.episodesBySeason.get(view.expandedSeasonId) || [],
        loadState
    );
    if (!updated) {
        renderSeriesView(view, loadState, scrollTop);
        return;
    }
    scheduleSeriesSeasonScroll(view.expandedSeasonId, scrollTop, scrollToExpandedSeason);
}

function scheduleSeriesSeasonScroll(
    expandedSeasonId: string,
    scrollTop: number,
    scrollToExpandedSeason: boolean
): void {
    requestAnimationFrame(() => {
        if (!scrollToExpandedSeason) {
            window.scrollTo(0, scrollTop);
            return;
        }
        const expandedSeason = [...document.querySelectorAll<HTMLElement>(".series-season")]
            .find(season => season.dataset.seasonId === expandedSeasonId);
        expandedSeason?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
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

    showLoading("home");

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
    await fetchAndRenderPlayableDetails({
        kind: "movie",
        itemId: movieId,
        itemName: movieName,
        addBreadcrumb: true
    });
}

export async function reloadMovie(breadcrumb: { id: string; name: string }): Promise<void> {
    await fetchAndRenderPlayableDetails({
        kind: "movie",
        itemId: breadcrumb.id,
        itemName: breadcrumb.name,
        addBreadcrumb: false
    });
}

export async function loadEpisode(episodeId: string, episodeName: string): Promise<void> {
    await fetchAndRenderPlayableDetails({
        kind: "episode",
        itemId: episodeId,
        itemName: episodeName,
        addBreadcrumb: true
    });
}

export async function reloadEpisode(breadcrumb: { id: string; name: string }): Promise<void> {
    await fetchAndRenderPlayableDetails({
        kind: "episode",
        itemId: breadcrumb.id,
        itemName: breadcrumb.name,
        addBreadcrumb: false
    });
}

export async function toggleSeriesSeason(seasonId: string): Promise<void> {
    const view = currentSeriesView;
    if (!view || !view.seasons.some(season => season.Id === seasonId)) {
        return;
    }
    if (view.expandedSeasonId === seasonId) {
        seriesSeasonRequests.cancel();
        setExpandedSeriesSeason(view, "");
        renderSeriesSeason(view, "ready", window.scrollY, false);
        return;
    }
    await expandSeriesSeason(view, seasonId, false);
}

export async function retryExpandedSeriesSeason(): Promise<void> {
    const view = currentSeriesView;
    if (!view?.expandedSeasonId) {
        return;
    }
    await expandSeriesSeason(view, view.expandedSeasonId, true);
}

export async function performSearch(query: string): Promise<void> {
    const requestId = beginViewRequest();
    sidebarStore.setRetryOperation({ kind: "search", query });
    updateTitle("Search Results");
    showLoading("search");
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
