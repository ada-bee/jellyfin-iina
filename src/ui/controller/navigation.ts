import { ui } from "../dom";
import { state } from "../state";
import { log, normalizeQuery } from "../utils";
import {
    cancelPendingViewRequest,
    loadHome,
    performSearch,
    reloadEpisodes,
    reloadItems,
    reloadSeasons
} from "./loaders";

let searchTimer: ReturnType<typeof setTimeout> | null = null;

export function updateSearchState(query: string): void {
    state.searchQuery = query;
    ui.clearSearchButton.classList.toggle("hidden", !query);
}

export function resetSearchState(shouldReload: boolean = true): void {
    cancelScheduledSearch();
    ui.searchInput.value = "";
    updateSearchState("");
    state.searchFilter = "all";
    ui.searchFilters.querySelectorAll<HTMLButtonElement>("[data-search-filter]").forEach(button => {
        button.setAttribute("aria-pressed", String(button.dataset.searchFilter === "all"));
    });

    if (shouldReload) {
        void loadHome();
    }
}

export function handleBack(): void {
    if (state.breadcrumb.length === 0) {
        return;
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

    resetBrowseContextForSearch();
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

    resetBrowseContextForSearch();
    void performSearch(query);
}

function resetBrowseContextForSearch(): void {
    cancelPendingViewRequest();
    state.breadcrumb = [];
    state.currentLibrary = null;
    state.currentSeries = null;
    state.currentSeason = null;
}

function cancelScheduledSearch(): void {
    if (searchTimer !== null) {
        clearTimeout(searchTimer);
        searchTimer = null;
    }
}
