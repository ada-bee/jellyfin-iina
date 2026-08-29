import { ui } from "../dom";
import { setFocusedBackdropCard, setHoveredBackdropCard } from "../backdropContext";
import { findListCard, getCardContext, handleContentError, setSearchFilter } from "../views";
import { state, type SearchFilter } from "../store";
import { playItem } from "../playback";
import { setupSeasonMenu } from "../seasonMenu";
import {
    handleBack,
    handleClearSearch,
    handleRetry,
    handleSearchInput,
    handleSearchSubmit,
    resetSearchState,
    updateSearchFilterRoute
} from "./navigation";
import { handleLogin } from "./session";
import {
    loadItems,
    loadMovie,
    loadSeriesDetails,
    retrySelectedSeriesSeason,
    saveCurrentLibraryScrollPosition,
    selectSeriesSeason
} from "./loaders";
import { resolveCardSelection } from "../selection";

let scrollStateObserver: ResizeObserver | null = null;
let backdropInteractionListenersInstalled = false;
const NAVIGATION_ELEVATION_DISTANCE = 24;

export function setupEventListeners(): void {
    setupNavigationScrollState();
    setupBackdropInteractionListeners();
    setupSeasonMenu(seasonId => void selectSeriesSeason(seasonId));
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

export function setupBackdropInteractionListeners(): void {
    if (backdropInteractionListenersInstalled) {
        return;
    }
    backdropInteractionListenersInstalled = true;
    ui.content.addEventListener("pointerover", handleContentPointerOver);
    ui.content.addEventListener("pointerout", handleContentPointerOut);
    ui.content.addEventListener("focusin", handleContentFocusIn);
    ui.content.addEventListener("focusout", handleContentFocusOut);
}

function handleContentPointerOut(event: PointerEvent): void {
    const card = findListCard(event.target);
    const nextCard = findListCard(event.relatedTarget);
    if (card && card !== nextCard) {
        setHoveredBackdropCard(nextCard);
    }
}

function handleContentPointerOver(event: PointerEvent): void {
    const card = findListCard(event.target);
    const previousCard = findListCard(event.relatedTarget);
    if (!card || card === previousCard || !ui.content.contains(card)) {
        return;
    }
    setHoveredBackdropCard(card);
}

function handleContentFocusIn(event: FocusEvent): void {
    const card = findListCard(event.target);
    if (!card || !ui.content.contains(card)) {
        return;
    }
    setFocusedBackdropCard(card);
}

function handleContentFocusOut(event: FocusEvent): void {
    const card = findListCard(event.target);
    const nextCard = findListCard(event.relatedTarget);
    if (card && card !== nextCard) {
        setFocusedBackdropCard(nextCard);
    }
}

export function setupNavigationScrollState(): void {
    if (scrollStateObserver) {
        return;
    }
    const updateScrollState = () => {
        const navigationElevation = Math.min(
            Math.max(window.scrollY, 0) / NAVIGATION_ELEVATION_DISTANCE,
            1
        );
        ui.navigationLayer.style.setProperty("--navigation-elevation", navigationElevation.toFixed(3));
        const pageOverflows = document.documentElement.scrollHeight > window.innerHeight + 1;
        const contentOverflows = ui.content.scrollHeight > ui.content.clientHeight + 1;
        const hasVerticalOverflow = pageOverflows || contentOverflows;
        ui.bottomSearchLayer.classList.toggle("bottom-search-layer--elevated", hasVerticalOverflow);
    };
    window.addEventListener("scroll", updateScrollState, { passive: true });
    window.addEventListener("resize", updateScrollState, { passive: true });
    scrollStateObserver = new ResizeObserver(updateScrollState);
    scrollStateObserver.observe(document.body);
    scrollStateObserver.observe(ui.content);
    updateScrollState();
}

function handleContentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    if (handleDetailPlayClick(target)) {
        return;
    }
    if (target?.closest("[data-season-retry]")) {
        void retrySelectedSeriesSeason();
        return;
    }
    if (handleHomeLibraryClick(target)) {
        return;
    }
    const card = findListCard(event.target);
    if (!card || !ui.content.contains(card)) {
        return;
    }

    handleListCardSelection(card);
}

function handleDetailPlayClick(target: HTMLElement | null): boolean {
    const button = target?.closest<HTMLButtonElement>("[data-detail-play]");
    if (!button) {
        return false;
    }
    const id = button.dataset.id || "";
    if (id) {
        void playItem(
            id,
            button.dataset.name || "Video",
            Number.parseInt(button.dataset.resume || "0", 10) || 0,
            getDetailPlaybackContext(button)
        );
    }
    return true;
}

function getDetailPlaybackContext(button: HTMLButtonElement): {
    seriesId: string;
    seasonId: string;
    episodeIndex: number | null;
} {
    return {
        seriesId: button.dataset.seriesId || "",
        seasonId: button.dataset.seasonId || "",
        episodeIndex: button.dataset.episodeIndex
            ? Number.parseInt(button.dataset.episodeIndex, 10)
            : null
    };
}

function handleHomeLibraryClick(target: HTMLElement | null): boolean {
    const link = target?.closest<HTMLButtonElement>("[data-home-library]");
    if (!link) {
        return false;
    }
    void loadItems(
        "",
        link.dataset.homeLibraryName || "Library",
        link.dataset.homeLibrary || ""
    );
    return true;
}

function handleSearchFilterClick(event: MouseEvent): void {
    const button = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>("[data-search-filter]");
    const filter = button?.dataset.searchFilter;
    if (isSearchFilter(filter)) {
        updateSearchFilterRoute(filter);
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

    const { id, name, resume, context } = details;
    const action = resolveCardSelection(details);
    if (action === "play") {
        void playItem(id, name, resume, context);
        return;
    }
    prepareForDetailsNavigation();
    if (action === "open-movie") {
        void loadMovie(id, name);
        return;
    }
    void loadSeriesDetails(id, name);
}

function prepareForDetailsNavigation(): void {
    if (state.searchQuery) {
        resetSearchState(false);
        return;
    }
    saveCurrentLibraryScrollPosition();
}
