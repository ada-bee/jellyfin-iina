import { ui } from "../dom";
import { state } from "../state";
import { log, normalizeQuery } from "../utils";
import {
    cancelPendingViewRequest,
    loadHome,
    performSearch,
    reloadEpisodes,
    reloadItems,
    reloadSeasons,
    saveCurrentLibraryScrollPosition
} from "./loaders";

let searchTimer: ReturnType<typeof setTimeout> | null = null;

export function updateSearchState(query: string): void {
    state.searchQuery = query;
    ui.clearSearchButton.classList.toggle("hidden", !query);
}

export function resetSearchState(shouldReload: boolean = true): void {
    const searchOrigin = state.searchOrigin;
    cancelScheduledSearch();
    ui.searchInput.value = "";
    updateSearchState("");
    setSearchFilterSelection("all");
    state.searchOrigin = null;

    if (shouldReload) {
        const libraryBreadcrumb = state.breadcrumb[state.breadcrumb.length - 1];
        if (
            (searchOrigin === "library" || searchOrigin === null) &&
            state.currentLibrary &&
            libraryBreadcrumb?.type === "library"
        ) {
            void reloadItems(libraryBreadcrumb);
            return;
        }
        state.breadcrumb = [];
        state.currentLibrary = null;
        state.currentSeries = null;
        state.currentSeason = null;
        void loadHome();
    }
}

export function handleBack(): void {
    if (state.breadcrumb.length === 0) {
        return;
    }

    if (state.breadcrumb[state.breadcrumb.length - 1]?.type === "library") {
        saveCurrentLibraryScrollPosition();
    }
    state.breadcrumb.pop();

    if (state.breadcrumb.length === 0) {
        state.currentLibrary = null;
        state.currentSeries = null;
        state.currentSeason = null;
        resetSearchState(false);
        void loadHome();
        return;
    }

    const prev = state.breadcrumb[state.breadcrumb.length - 1];
    switch (prev.type) {
        case "library":
            state.currentSeries = null;
            state.currentSeason = null;
            void reloadItems(prev);
            break;
        case "series":
            state.currentSeason = null;
            void reloadSeasons(prev);
            break;
        case "season":
            void reloadEpisodes(prev);
            break;
    }
}

export function handleRetry(): void {
    if (state.lastAction) {
        void state.lastAction();
    }
}

export function goHomeFresh(reason: string = ""): void {
    cancelScheduledSearch();
    state.breadcrumb = [];
    state.currentLibrary = null;
    state.currentSeries = null;
    state.currentSeason = null;
    state.lastAction = null;
    resetSearchState(false);
    if (reason) {
        log("Returning home:", reason);
    }
    void loadHome();
}

export function handleSearchInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    const query = normalizeQuery(value);
    updateSearchState(query);

    if (!query) {
        resetSearchState(true);
        return;
    }

    prepareBrowseContextForSearch();
    cancelScheduledSearch();
    searchTimer = setTimeout(() => {
        searchTimer = null;
        void performSearch(query);
    }, 280);
}

export function handleClearSearch(): void {
    resetSearchState(true);
}

export function handleSearchSubmit(event: Event): void {
    event.preventDefault();
    cancelScheduledSearch();
    const query = normalizeQuery(ui.searchInput.value);
    updateSearchState(query);

    if (!query) {
        resetSearchState(true);
        return;
    }

    prepareBrowseContextForSearch();
    void performSearch(query);
}

function prepareBrowseContextForSearch(): void {
    if (state.searchOrigin) {
        return;
    }

    cancelPendingViewRequest();
    const current = state.breadcrumb[state.breadcrumb.length - 1];
    if (current?.type === "library" && state.currentLibrary) {
        saveCurrentLibraryScrollPosition();
        state.searchOrigin = "library";
        setSearchFilterSelection(state.currentLibrary.type === "movies" ? "movie" : "series");
        return;
    }

    state.searchOrigin = "home";
    state.breadcrumb = [];
    state.currentLibrary = null;
    state.currentSeries = null;
    state.currentSeason = null;
}

function setSearchFilterSelection(filter: "all" | "movie" | "series"): void {
    state.searchFilter = filter;
    ui.searchFilters.querySelectorAll<HTMLButtonElement>("[data-search-filter]").forEach(button => {
        button.setAttribute("aria-pressed", String(button.dataset.searchFilter === filter));
    });
}

function cancelScheduledSearch(): void {
    if (searchTimer !== null) {
        clearTimeout(searchTimer);
        searchTimer = null;
    }
}
