import { ui } from "../dom";
import { getCurrentBrowseRoute, getCurrentRoute } from "../../sidebar/router";
import { sidebarStore, state, type SearchFilter } from "../../sidebar/store";
import { log, normalizeQuery } from "../runtimeUtils";
import {
    cancelPendingViewRequest,
    loadHome,
    performSearch,
    reloadItems,
    reloadMovie,
    reloadSeriesDetails,
    saveCurrentLibraryScrollPosition
} from "./loaders";

let searchTimer: ReturnType<typeof setTimeout> | null = null;

export function updateSearchState(query: string): void {
    sidebarStore.updateSearch(query);
    ui.clearSearchButton.classList.toggle("hidden", !query);
}

export function resetSearchState(shouldReload: boolean = true): void {
    cancelScheduledSearch();
    ui.searchInput.value = "";
    sidebarStore.clearSearch();
    ui.clearSearchButton.classList.add("hidden");
    setSearchFilterSelection("all");

    if (shouldReload) {
        const route = getCurrentRoute(state.router);
        if (route.kind === "library" && state.currentLibrary) {
            void reloadItems(route);
            return;
        }
        state.currentLibrary = null;
        state.currentSeries = null;
        void loadHome();
    }
}

export function handleBack(): void {
    const current = getCurrentRoute(state.router);
    if (current.kind === "home") {
        return;
    }

    if (current.kind === "library") {
        saveCurrentLibraryScrollPosition();
    }
    const previous = sidebarStore.back();
    if (previous.kind === "home") {
        state.currentLibrary = null;
        state.currentSeries = null;
        resetSearchState(false);
        void loadHome();
        return;
    }

    if (previous.kind === "search") {
        void performSearch(previous.query);
        return;
    }
    switch (previous.kind) {
        case "library":
            state.currentSeries = null;
            void reloadItems(previous);
            break;
        case "movie":
            void reloadMovie(previous);
            break;
        case "series":
            void reloadSeriesDetails(previous);
            break;
    }
}

export function handleRetry(): void {
    const operation = state.retryOperation;
    switch (operation?.kind) {
        case "home":
            void loadHome(operation.forceReload);
            break;
        case "library":
            void reloadItems(operation);
            break;
        case "movie":
            void reloadMovie(operation);
            break;
        case "series":
            void reloadSeriesDetails(operation);
            break;
        case "search":
            void performSearch(operation.query);
            break;
    }
}

export function goHomeFresh(reason: string = ""): void {
    cancelScheduledSearch();
    sidebarStore.navigateHome();
    state.currentLibrary = null;
    state.currentSeries = null;
    sidebarStore.setRetryOperation(null);
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
    if (getCurrentRoute(state.router).kind === "search") {
        return;
    }

    cancelPendingViewRequest();
    const current = getCurrentBrowseRoute(state.router);
    if (current.kind === "library" && state.currentLibrary) {
        saveCurrentLibraryScrollPosition();
        const filter = state.currentLibrary.type === "movies" ? "movie" : "series";
        sidebarStore.beginSearch(state.searchQuery, filter);
        setSearchFilterSelection(filter);
        return;
    }

    sidebarStore.beginSearch(state.searchQuery, "all");
    state.currentLibrary = null;
    state.currentSeries = null;
}

function setSearchFilterSelection(filter: "all" | "movie" | "series"): void {
    sidebarStore.setSearchFilter(filter);
    ui.searchFilters.querySelectorAll<HTMLButtonElement>("[data-search-filter]").forEach(button => {
        button.setAttribute("aria-pressed", String(button.dataset.searchFilter === filter));
    });
}

export function updateSearchFilterRoute(filter: SearchFilter): void {
    sidebarStore.setSearchFilter(filter);
}

function cancelScheduledSearch(): void {
    if (searchTimer !== null) {
        clearTimeout(searchTimer);
        searchTimer = null;
    }
}
