import { ui } from "../dom";
import { findListCard, getCardContext, handleContentError, setSearchFilter } from "../render";
import { state, type SearchFilter } from "../state";
import { playItem } from "../playback";
import {
    handleBack,
    handleClearSearch,
    handleRetry,
    handleSearchInput,
    handleSearchSubmit,
    resetSearchState
} from "./navigation";
import { handleLogin } from "./session";
import { loadEpisodes, loadItems, loadSeasons } from "./loaders";

export function setupEventListeners(): void {
    ui.loginForm.addEventListener("submit", handleLogin);
    ui.backBtn.addEventListener("click", handleBack);
    ui.retryBtn.addEventListener("click", handleRetry);
    ui.searchFilters.addEventListener("click", handleSearchFilterClick);
    ui.searchInput.addEventListener("input", handleSearchInput);
    ui.searchInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            handleSearchSubmit(event);
        } else if (event.key === "Escape") {
            event.preventDefault();
            handleClearSearch();
        }
    });
    ui.clearSearchButton.addEventListener("click", handleClearSearch);
    ui.content.addEventListener("click", handleContentClick);
    ui.content.addEventListener("keydown", handleContentKeydown);
    ui.content.addEventListener("error", handleContentError, true);
}

function handleContentClick(event: MouseEvent): void {
    const libraryLink = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>("[data-home-library]");
    if (libraryLink) {
        const collectionType = libraryLink.dataset.homeLibrary || "";
        const name = libraryLink.dataset.homeLibraryName || "Library";
        void loadItems("", name, collectionType);
        return;
    }

    const card = findListCard(event.target);
    if (!card || !ui.content.contains(card)) {
        return;
    }

    handleListCardSelection(card);
}

function handleSearchFilterClick(event: MouseEvent): void {
    const button = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>("[data-search-filter]");
    const filter = button?.dataset.searchFilter;
    if (isSearchFilter(filter)) {
        setSearchFilter(filter);
    }
}

function isSearchFilter(value: string | undefined): value is SearchFilter {
    return value === "all" || value === "movie" || value === "series" || value === "episode";
}

function handleContentKeydown(event: KeyboardEvent): void {
    if (event.key !== "Enter" && event.key !== " ") {
        return;
    }

    const card = findListCard(event.target);
    if (!card || !ui.content.contains(card)) {
        return;
    }

    event.preventDefault();
    handleListCardSelection(card);
}

function handleListCardSelection(card: HTMLElement): void {
    const details = getCardContext(card);
    if (!details || !details.id) {
        return;
    }

    const { id, name, type, resume, context } = details;

    if (type === "Series") {
        if (state.searchQuery) {
            resetSearchState(false);
        }
        void loadSeasons(id, name);
        return;
    }

    if (type === "Season") {
        void loadEpisodes(state.currentSeries?.id || "", id, name);
        return;
    }

    void playItem(id, name, resume, context);
}
