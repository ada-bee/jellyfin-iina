import {
    setupBackdropInteractionListeners,
    setupNavigationScrollState
} from "../sidebar/controllers/events";
import { ui } from "../sidebar/dom";
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
} from "../sidebar/views";
import { setupSeasonMenu } from "../sidebar/seasonMenu";
import { state, type SearchFilter } from "../sidebar/store";
import {
    previewMovie,
    previewSeries,
    recentEpisodes,
    recentMovies,
    recentSeries,
    searchResults,
    seasonEpisodes,
    seasons,
    upNextItems
} from "./fixtures";
import { createPreviewUrl, getRequestedPreview, type PreviewName } from "./routing";

export function setupFixturePreview(): void {
    setupNavigationScrollState();
    setupBackdropInteractionListeners();
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
        const filter = (event.target as HTMLElement | null)
            ?.closest<HTMLButtonElement>("[data-search-filter]")?.dataset.searchFilter;
        if (isSearchFilter(filter)) {
            setSearchFilter(filter);
        }
    });
    ui.content.addEventListener("click", handleContentClick);
    window.addEventListener("popstate", () => renderPreview(getRequestedPreview(window.location.search)));

    state.serverUrl = window.location.origin;
    state.serverName = "Moonbase";
    state.username = "adela";
    state.preferEpisodeImagesInNextUp = false;
    hideLoading();
    renderPreview(getRequestedPreview(window.location.search));
}

function handleContentClick(event: MouseEvent): void {
    const libraryLink = (event.target as HTMLElement | null)
        ?.closest<HTMLButtonElement>("[data-home-library]");
    if (libraryLink) {
        showPreviewLibrary(libraryLink);
        return;
    }
    const context = getCardContext(findListCard(event.target));
    if (context?.type === "Series") {
        navigateToPreview("series");
    } else if (context?.type === "Movie" && !context.directPlay) {
        navigateToPreview("movie");
    }
}

function showPreviewLibrary(libraryLink: HTMLButtonElement): void {
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
}

function navigateToPreview(name: PreviewName): void {
    const url = createPreviewUrl(window.location.href, name);
    window.history.pushState({ preview: name }, "", url);
    renderPreview(name);
}

function renderPreview(name: PreviewName): void {
    resetPreviewUi();
    previewRenderers[name]();
    document.documentElement.dataset.previewState = name;
    document.title = `Jellyfin sidebar — ${name}`;
}

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

const previewRenderers: Record<PreviewName, () => void> = {
    home() {
        showBrowseView();
        updateTitle("Home");
        renderHomeSections(upNextItems, recentEpisodes, recentMovies, recentSeries);
    },
    search() {
        showBrowseView();
        ui.searchInput.value = "station";
        ui.clearSearchButton.classList.remove("hidden");
        state.searchQuery = "station";
        updateTitle("Search Results");
        renderSearchResults(searchResults);
    },
    movie() {
        showBrowseView();
        state.breadcrumb = [{
            type: "movie",
            id: previewMovie.Id || "signal-fire",
            name: String(previewMovie.Name)
        }];
        updateTitle(String(previewMovie.Name));
        renderMovieDetails(previewMovie);
    },
    series() {
        showBrowseView();
        state.currentSeries = { id: "series-north-station", name: "North Station", selectedSeasonId: "season-1" };
        state.breadcrumb = [{ type: "series", id: "series-north-station", name: "North Station" }];
        updateTitle("North Station");
        renderSeriesDetails(previewSeries, seasons, "season-1", seasonEpisodes, upNextItems[0], "ready");
    },
    login: showLoginView,
    loading() {
        showBrowseView();
        updateTitle("Home");
        showLoading();
    },
    empty() {
        showBrowseView();
        state.searchQuery = "something unavailable";
        ui.searchInput.value = state.searchQuery;
        ui.clearSearchButton.classList.remove("hidden");
        updateTitle("Search Results");
        renderEmptyState("No results found");
    },
    error() {
        showBrowseView();
        updateTitle("Home");
        showError("The Jellyfin server could not be reached.");
    }
};

function isSearchFilter(value: string | undefined): value is SearchFilter {
    return value === "all" || value === "movie" || value === "series" || value === "episode";
}
