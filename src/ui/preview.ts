import type { JellyfinBaseItem } from "../shared/jellyfin";

import { ui } from "./dom";
import { setupEventListeners } from "./controller/events";
import { loadHome } from "./controller/loaders";
import {
    findListCard,
    getCardContext,
    hideLoading,
    renderEmptyState,
    renderHomeSections,
    renderLibraryGrid,
    renderListCards,
    renderSearchResults,
    renderSeriesOverview,
    setSearchFilter,
    showBrowseView,
    showError,
    showLoading,
    showLoginView,
    updateTitle
} from "./render";
import { state, type SearchFilter } from "./state";
import { getDeviceId } from "./storage";

type PreviewName = "home" | "search" | "series" | "episodes" | "login" | "loading" | "empty" | "error";

const TICKS_PER_MINUTE = 600_000_000;

function episode(
    id: string,
    name: string,
    seriesName: string,
    seasonNumber: number,
    episodeNumber: number,
    runtimeMinutes: number,
    progressPercent = 0
): JellyfinBaseItem {
    return {
        Id: id,
        Name: name,
        Type: "Episode",
        SeriesId: `series-${seriesName.toLowerCase().replace(/ /g, "-")}`,
        SeasonId: `season-${seasonNumber}`,
        SeriesName: seriesName,
        ParentIndexNumber: seasonNumber,
        IndexNumber: episodeNumber,
        RunTimeTicks: runtimeMinutes * TICKS_PER_MINUTE,
        UserData: {
            PlaybackPositionTicks: Math.round(runtimeMinutes * TICKS_PER_MINUTE * progressPercent / 100),
            Played: progressPercent === 100
        }
    };
}

function movie(
    id: string,
    name: string,
    year: number,
    runtimeMinutes: number,
    progressPercent = 0
): JellyfinBaseItem {
    return {
        Id: id,
        Name: name,
        Type: "Movie",
        ProductionYear: year,
        RunTimeTicks: runtimeMinutes * TICKS_PER_MINUTE,
        UserData: {
            PlaybackPositionTicks: Math.round(runtimeMinutes * TICKS_PER_MINUTE * progressPercent / 100),
            Played: progressPercent === 100
        }
    };
}

function series(id: string, name: string, year: number, watched: number, total: number): JellyfinBaseItem {
    return {
        Id: id,
        Name: name,
        Type: "Series",
        ProductionYear: year,
        RecursiveItemCount: total,
        UserData: {
            UnplayedItemCount: total - watched
        }
    };
}

function season(id: string, name: string): JellyfinBaseItem {
    return {
        Id: id,
        Name: name,
        Type: "Season"
    };
}

const upNextItems = [
    episode("the-plan", "The Plan", "North Station", 1, 5, 48, 63),
    episode("after-the-storm", "After the Storm", "Still Water", 2, 3, 54),
    episode("the-long-way-home", "The Long Way Home", "Orbital", 1, 8, 42, 100)
];

const recentMovies = [
    movie("signal-fire", "Signal Fire", 2025, 112),
    movie("quiet-city", "The Quiet City", 2024, 98, 24),
    movie("night-train", "Night Train to Brno", 2026, 126)
];

const recentEpisodes = [
    episode("open-water", "Open Water", "Still Water", 2, 2, 51),
    episode("arrival", "Arrival", "North Station", 1, 4, 46),
    episode("relay", "Relay", "Orbital", 1, 7, 44)
];

const recentSeries = [
    series("series-still-water", "Still Water", 2025, 7, 10),
    series("series-north-station", "North Station", 2025, 4, 10),
    series("series-orbital", "Orbital", 2024, 7, 8),
    series("series-quiet-city", "The Quiet City", 2024, 3, 8),
    series("series-night-train", "Night Train", 2026, 1, 6)
];

const searchResults = [
    series("series-north-station", "North Station", 2025, 4, 10),
    episode("the-plan", "The Plan", "North Station", 1, 5, 48, 63),
    movie("distant-signal", "A Distant Signal", 2019, 104, 100),
    movie("signal-fire", "Signal Fire", 2025, 112),
    series("series-orbital", "Orbital", 2024, 7, 8),
    episode("relay", "Relay", "Orbital", 1, 7, 44)
];

const seasons = [
    season("season-1", "Season 1"),
    season("season-2", "Season 2"),
    season("season-3", "Season 3"),
    season("season-specials", "Specials")
];

const seasonEpisodes = [
    episode("first-light", "First Light", "North Station", 1, 1, 47, 100),
    episode("interchange", "Interchange", "North Station", 1, 2, 45, 100),
    episode("dead-line", "Dead Line", "North Station", 1, 3, 52, 81),
    episode("arrival", "Arrival", "North Station", 1, 4, 46),
    episode("the-plan", "The Plan", "North Station", 1, 5, 48)
];

function resetPreviewUi(): void {
    state.breadcrumb = [];
    state.currentLibrary = null;
    state.currentSeries = null;
    state.currentSeason = null;
    state.searchQuery = "";
    state.searchFilter = "all";
    state.searchOrigin = null;
    ui.loading.classList.add("hidden");
    ui.errorState.classList.add("hidden");
    ui.content.classList.remove("hidden");
    ui.searchInput.value = "";
    ui.clearSearchButton.classList.add("hidden");
}

function prepareBrowseView(): void {
    showBrowseView();
}

const previewRenderers: Record<PreviewName, () => void> = {
    home() {
        prepareBrowseView();
        updateTitle("Home");
        renderHomeSections(upNextItems, recentEpisodes, recentMovies, recentSeries);
    },
    search() {
        prepareBrowseView();
        ui.searchInput.value = "station";
        ui.clearSearchButton.classList.remove("hidden");
        state.searchQuery = "station";
        updateTitle("Search Results");
        renderSearchResults(searchResults);
    },
    series() {
        prepareBrowseView();
        state.currentSeries = { id: "series-north-station", name: "North Station" };
        state.breadcrumb = [{ type: "series", id: "series-north-station", name: "North Station" }];
        updateTitle("North Station");
        renderSeriesOverview(upNextItems[0], seasons);
    },
    episodes() {
        prepareBrowseView();
        state.currentSeries = { id: "series-north-station", name: "North Station" };
        state.currentSeason = { id: "season-1", name: "Season 1" };
        state.breadcrumb = [
            { type: "series", id: "series-north-station", name: "North Station" },
            { type: "season", id: "season-1", seriesId: "series-north-station", name: "Season 1" }
        ];
        updateTitle("Season 1");
        renderListCards(seasonEpisodes, {
            showSeriesName: false,
            showEpisodeNumber: true,
            useEpisodeThumbnail: true
        });
    },
    login() {
        showLoginView();
    },
    loading() {
        prepareBrowseView();
        updateTitle("Home");
        showLoading();
    },
    empty() {
        prepareBrowseView();
        state.searchQuery = "something unavailable";
        ui.searchInput.value = state.searchQuery;
        ui.clearSearchButton.classList.remove("hidden");
        updateTitle("Search Results");
        renderEmptyState("No results found");
    },
    error() {
        prepareBrowseView();
        updateTitle("Home");
        showError("The Jellyfin server could not be reached.");
    }
};

function isPreviewName(value: string | null): value is PreviewName {
    return Boolean(value && Object.prototype.hasOwnProperty.call(previewRenderers, value));
}

function renderPreview(name: PreviewName): void {
    resetPreviewUi();
    previewRenderers[name]();
    document.documentElement.dataset.previewState = name;
    document.title = `Jellyfin sidebar — ${name}`;
}

function navigateToPreview(name: PreviewName): void {
    const url = new URL(window.location.href);
    url.searchParams.set("state", name);
    window.history.pushState({ preview: name }, "", url);
    renderPreview(name);
}

function getRequestedPreview(): PreviewName {
    const requested = new URLSearchParams(window.location.search).get("state");
    return isPreviewName(requested) ? requested : "home";
}

interface LivePreviewSession {
    serverUrl: string;
    accessToken: string;
    userId: string;
    username: string;
    serverName: string;
}

function setupFixturePreview(): void {
    ui.backBtn.addEventListener("click", () => navigateToPreview("home"));
    ui.sectionTitle.addEventListener("click", () => navigateToPreview("home"));
    ui.retryBtn.addEventListener("click", () => navigateToPreview("home"));
    ui.clearSearchButton.addEventListener("click", () => navigateToPreview("home"));
    ui.loginForm.addEventListener("submit", event => {
        event.preventDefault();
        navigateToPreview("home");
    });
    ui.searchInput.addEventListener("keydown", event => {
        if (event.key === "Enter") {
            event.preventDefault();
            navigateToPreview("search");
        }
    });
    ui.searchFilters.addEventListener("click", event => {
        const filter = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>("[data-search-filter]")?.dataset.searchFilter;
        if (isSearchFilter(filter)) {
            setSearchFilter(filter);
        }
    });
    ui.content.addEventListener("click", event => {
        const libraryLink = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>("[data-home-library]");
        if (libraryLink) {
            const collectionType = libraryLink.dataset.homeLibrary || "movies";
            const name = libraryLink.dataset.homeLibraryName || "Library";
            const items = collectionType === "movies" ? recentMovies : recentSeries;
            state.breadcrumb = [{ type: "library", id: `preview-${collectionType}`, name, collectionType }];
            state.currentLibrary = {
                id: `preview-${collectionType}`,
                name,
                type: collectionType,
                items,
                totalItemCount: items.length,
                hasMore: false,
                isLoadingMore: false,
                scrollTop: 0
            };
            updateTitle(name);
            renderLibraryGrid(items, false, () => undefined);
            return;
        }
        const card = findListCard(event.target);
        const context = getCardContext(card);
        if (context?.type === "Series") {
            navigateToPreview("series");
        } else if (context?.type === "Season") {
            navigateToPreview("episodes");
        }
    });
    window.addEventListener("popstate", () => renderPreview(getRequestedPreview()));

    state.serverUrl = window.location.origin;
    state.serverName = "Moonbase";
    state.username = "adela";
    state.preferEpisodeImagesInNextUp = false;
    hideLoading();
    renderPreview(getRequestedPreview());
}

function installIinaStub(): void {
    Object.defineProperty(window, "iina", {
        configurable: true,
        value: {
            postMessage: () => undefined,
            onMessage: () => undefined
        }
    });
}

async function loadLivePreview(): Promise<void> {
    document.documentElement.dataset.previewState = "live";
    document.title = "Jellyfin sidebar — live";
    showBrowseView();
    updateTitle("Home");
    showLoading();

    try {
        const response = await fetch("/__preview/session", { cache: "no-store" });
        if (!response.ok) {
            throw new Error(await response.text());
        }
        const session = await response.json() as LivePreviewSession;
        state.serverUrl = session.serverUrl;
        state.accessToken = session.accessToken;
        state.userId = session.userId;
        state.username = session.username;
        state.serverName = session.serverName;
        state.deviceId = getDeviceId();
        state.preferEpisodeImagesInNextUp = false;
        await loadHome();
    } catch (error) {
        state.lastAction = loadLivePreview;
        showError(error instanceof Error ? error.message : "Could not load the IINA Jellyfin session");
    }
}

function setupLivePreview(): void {
    installIinaStub();
    setupEventListeners();
    void loadLivePreview();
}

if (new URLSearchParams(window.location.search).get("source") === "live") {
    setupLivePreview();
} else {
    setupFixturePreview();
}

function isSearchFilter(value: string | undefined): value is SearchFilter {
    return value === "all" || value === "movie" || value === "series" || value === "episode";
}
