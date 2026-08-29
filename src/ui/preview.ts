import type { JellyfinBaseItem } from "../shared/jellyfin";

import { ui } from "./dom";
import { setupEventListeners, setupNavigationScrollState } from "./controller/events";
import { loadHome } from "./controller/loaders";
import {
    findListCard,
    getCardContext,
    hideLoading,
    renderEmptyState,
    renderHomeSections,
    renderLibraryGrid,
    renderMovieDetails,
    renderSearchResults,
    renderSeriesDetails,
    renderSeriesEpisodes,
    setSearchFilter,
    showBrowseView,
    showError,
    showLoading,
    showLoginView,
    updateTitle
} from "./render";
import { state, type SearchFilter } from "./state";
import { getDeviceId } from "./storage";
import { setupSeasonMenu } from "./seasonMenu";

type PreviewName = "home" | "search" | "movie" | "series" | "login" | "loading" | "empty" | "error";

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

function season(id: string, name: string, indexNumber: number): JellyfinBaseItem {
    return {
        Id: id,
        Name: name,
        Type: "Season",
        IndexNumber: indexNumber
    };
}

const upNextItems = [
    episode("the-plan", "The Plan", "North Station", 1, 5, 48, 63),
    episode("after-the-storm", "After the Storm", "Still Water", 2, 3, 54),
    episode("the-long-way-home", "The Long Way Home", "Orbital", 1, 8, 42, 100),
    episode("the-crossing", "The Crossing", "Still Water", 2, 4, 49),
    episode("signal-lost", "Signal Lost", "North Station", 1, 6, 47, 18),
    episode("apogee", "Apogee", "Orbital", 2, 1, 45),
    episode("undertow", "Undertow", "Still Water", 2, 5, 52),
    episode("last-service", "Last Service", "North Station", 1, 7, 50)
];

const recentMovies = [
    movie("signal-fire", "Signal Fire", 2025, 112),
    movie("quiet-city", "The Quiet City", 2024, 98, 24),
    movie("night-train", "Night Train to Brno", 2026, 126),
    movie("glass-harbor", "Glass Harbor", 2025, 108),
    movie("winter-orbit", "Winter Orbit", 2024, 117),
    movie("second-sun", "The Second Sun", 2026, 103),
    movie("low-tide", "Low Tide", 2025, 94),
    movie("frequency", "Frequency", 2024, 101)
];

const previewMovie: JellyfinBaseItem = {
    ...recentMovies[0],
    Overview: "After a mysterious transmission reaches an isolated mountain town, a radio astronomer must decide whether its warning is meant for Earth—or came from it.",
    Taglines: ["Some signals are better left unanswered."],
    OfficialRating: "PG-13"
};

const recentEpisodes = [
    episode("open-water", "Open Water", "Still Water", 2, 2, 51),
    episode("arrival", "Arrival", "North Station", 1, 4, 46),
    episode("relay", "Relay", "Orbital", 1, 7, 44),
    episode("the-crossing-new", "The Crossing", "Still Water", 2, 4, 49),
    episode("signal-lost-new", "Signal Lost", "North Station", 1, 6, 47),
    episode("apogee-new", "Apogee", "Orbital", 2, 1, 45),
    episode("undertow-new", "Undertow", "Still Water", 2, 5, 52),
    episode("last-service-new", "Last Service", "North Station", 1, 7, 50)
];

const recentSeries = [
    series("series-still-water", "Still Water", 2025, 7, 10),
    series("series-north-station", "North Station", 2025, 4, 10),
    series("series-orbital", "Orbital", 2024, 7, 8),
    series("series-quiet-city", "The Quiet City", 2024, 3, 8),
    series("series-night-train", "Night Train", 2026, 1, 6),
    series("series-glass-harbor", "Glass Harbor", 2025, 3, 9),
    series("series-second-sun", "The Second Sun", 2026, 2, 8),
    series("series-low-tide", "Low Tide", 2025, 5, 7)
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
    season("season-1", "Season 1", 1),
    season("season-2", "Season 2", 2),
    season("season-3", "Season 3: The Very Long Winter Timetable", 3),
    season("season-specials", "Specials", 0)
];

const previewSeries: JellyfinBaseItem = {
    ...recentSeries[1],
    Overview: "A night-shift dispatcher discovers that every train passing through North Station is carrying someone who should not exist.",
    Taglines: ["Every arrival changes the timetable."],
    OfficialRating: "TV-14",
    Status: "Continuing"
};

const seasonEpisodes = [
    {
        ...episode("first-light", "First Light", "North Station", 1, 1, 47, 100),
        Overview: "Mara follows an impossible signal into the station's sealed lower platforms."
    },
    {
        ...episode("interchange", "Interchange", "North Station", 1, 2, 45, 100),
        Overview: "A missed connection brings a stranger with a warning from another timetable."
    },
    {
        ...episode("dead-line", "Dead Line", "North Station", 1, 3, 52, 81),
        Overview: "The night crew races to stop a train that no longer appears on their maps."
    },
    {
        ...episode("arrival", "Arrival", "North Station", 1, 4, 46),
        Overview: "An unexpected passenger forces Mara to question what she knows about the station."
    },
    {
        ...episode("the-plan", "The Plan", "North Station", 1, 5, 48),
        Overview: "With time running short, the crew prepares one last attempt to close the line."
    }
];

function resetPreviewUi(): void {
    state.breadcrumb = [];
    state.currentLibrary = null;
    state.currentSeries = null;
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
    movie() {
        prepareBrowseView();
        state.breadcrumb = [{ type: "movie", id: previewMovie.Id || "signal-fire", name: String(previewMovie.Name) }];
        updateTitle(String(previewMovie.Name));
        renderMovieDetails(previewMovie);
    },
    series() {
        prepareBrowseView();
        state.currentSeries = { id: "series-north-station", name: "North Station", selectedSeasonId: "season-1" };
        state.breadcrumb = [{ type: "series", id: "series-north-station", name: "North Station" }];
        updateTitle("North Station");
        renderSeriesDetails(previewSeries, seasons, "season-1", seasonEpisodes, upNextItems[0], "ready");
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
    setupNavigationScrollState();
    setupSeasonMenu(seasonId => {
        const seasonNumber = seasons.find(item => item.Id === seasonId)?.IndexNumber || 1;
        const episodes = seasonEpisodes.map(item => ({ ...item, ParentIndexNumber: seasonNumber }));
        state.currentSeries = { id: "series-north-station", name: "North Station", selectedSeasonId: seasonId };
        renderSeriesEpisodes(seasons, seasonId, episodes, "ready");
    });
    ui.backBtn.addEventListener("click", () => navigateToPreview("home"));
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
        } else if (context?.type === "Movie" && !context.directPlay) {
            navigateToPreview("movie");
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
