import type { JellyfinBaseItem } from "../../jellyfin/types";
import { buildSearchResultsViewModel } from "../viewModels";
import { setBackdropSlideshow } from "../backdropContext";
import { ui } from "../dom";
import { state, type SearchFilter } from "../store";
import { buildListCardElement, getSearchCardOptions } from "./cards";
import { renderEmptyState } from "./chrome";
import { replaceContent } from "./content";

let cachedSearchResults: JellyfinBaseItem[] = [];

export function renderSearchResults(items: JellyfinBaseItem[]): void {
    cachedSearchResults = [...items];
    renderFilteredSearchResults();
}

export function setSearchFilter(filter: SearchFilter): void {
    state.searchFilter = filter;
    ui.searchFilters.querySelectorAll<HTMLButtonElement>("[data-search-filter]").forEach(button => {
        button.setAttribute("aria-pressed", String(button.dataset.searchFilter === filter));
    });
    renderFilteredSearchResults();
}

function renderFilteredSearchResults(): void {
    const viewModel = buildSearchResultsViewModel(cachedSearchResults, state.searchFilter);
    if (viewModel.visibleItems.length === 0) {
        renderEmptyState(viewModel.emptyMessage);
        return;
    }

    const results = document.createElement("div");
    results.className = "search-results";
    if (viewModel.posterItems.length > 0) {
        results.appendChild(buildSearchResultGroup(viewModel.posterItems, "library-poster-grid"));
    }
    if (viewModel.remainingItems.length > 0) {
        results.appendChild(buildSearchResultGroup(viewModel.remainingItems, "media-list"));
    }
    replaceContent(results);
    setBackdropSlideshow(viewModel.visibleItems);
}

function buildSearchResultGroup(items: JellyfinBaseItem[], className: string): HTMLElement {
    const group = document.createElement("div");
    group.className = className;
    items.forEach(item => group.appendChild(buildListCardElement(item, getSearchCardOptions(item))));
    return group;
}
