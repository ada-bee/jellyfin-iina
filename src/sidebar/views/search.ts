import type { JellyfinBaseItem } from "../../jellyfin/types";
import {
    buildSearchResultsViewModel,
    type SearchResultSection
} from "../viewModels";
import { setBackdropSlideshow } from "../backdropContext";
import { ui } from "../dom";
import { state, type SearchFilter } from "../store";
import { buildListCardElement, getSearchCardOptions } from "./cards";
import { renderEmptyState } from "./chrome";
import { replaceContent } from "./content";
import { buildDisclosureChevron } from "./elements";

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
    viewModel.sections.forEach(section => results.appendChild(
        buildSearchResultSection(section, state.searchFilter === "all")
    ));
    replaceContent(results);
    setBackdropSlideshow(viewModel.visibleItems);
}

function buildSearchResultSection(sectionModel: SearchResultSection, headingIsLink: boolean): HTMLElement {
    const section = document.createElement("section");
    section.className = `search-result-section search-result-section--${sectionModel.filter}`;
    section.appendChild(buildSearchResultHeading(sectionModel, headingIsLink));

    const grid = document.createElement("div");
    grid.className = sectionModel.filter === "episode"
        ? "search-episode-grid"
        : "library-poster-grid";
    sectionModel.items.forEach(item => grid.appendChild(
        buildListCardElement(item, getSearchCardOptions(item))
    ));
    section.appendChild(grid);
    return section;
}

function buildSearchResultHeading(section: SearchResultSection, isLink: boolean): HTMLElement {
    const heading = document.createElement("h3");
    heading.className = "search-result-heading";
    if (!isLink) {
        heading.textContent = section.label;
        return heading;
    }

    const button = document.createElement("button");
    button.className = "search-result-heading-link";
    button.type = "button";
    button.dataset.searchSectionFilter = section.filter;
    button.setAttribute("data-clickable", "");
    button.setAttribute("aria-label", `Show all ${section.label}`);
    const label = document.createElement("span");
    label.textContent = section.label;
    button.append(label, buildDisclosureChevron());
    heading.appendChild(button);
    return heading;
}
