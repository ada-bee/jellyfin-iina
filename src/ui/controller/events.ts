import { ui } from "../dom";
import { setFocusedBackdropCard, setHoveredBackdropCard } from "../backdropContext";
import { findListCard, getCardContext, handleContentError, setSearchFilter } from "../render";
import { state, type SearchFilter } from "../state";
import { playItem } from "../playback";
import { setupSeasonMenu } from "../seasonMenu";
import {
    handleBack,
    handleClearSearch,
    handleRetry,
    handleSearchInput,
    handleSearchSubmit,
    resetSearchState
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
    const detailPlayButton = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>("[data-detail-play]");
    if (detailPlayButton) {
        const id = detailPlayButton.dataset.id || "";
        if (id) {
            void playItem(
                id,
                detailPlayButton.dataset.name || "Video",
                Number.parseInt(detailPlayButton.dataset.resume || "0", 10) || 0,
                {
                    seriesId: detailPlayButton.dataset.seriesId || "",
                    seasonId: detailPlayButton.dataset.seasonId || "",
                    episodeIndex: detailPlayButton.dataset.episodeIndex
                        ? Number.parseInt(detailPlayButton.dataset.episodeIndex, 10)
                        : null
                }
            );
        }
        return;
    }

    if ((event.target as HTMLElement | null)?.closest("[data-season-retry]")) {
        void retrySelectedSeriesSeason();
        return;
    }

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

    const { id, name, type, resume, directPlay, context } = details;

    if (type === "Series") {
        if (state.searchQuery) {
            resetSearchState(false);
        } else {
            saveCurrentLibraryScrollPosition();
        }
        void loadSeriesDetails(id, name);
        return;
    }

    if (type === "Movie" && !directPlay) {
        if (state.searchQuery) {
            resetSearchState(false);
        } else {
            saveCurrentLibraryScrollPosition();
        }
        void loadMovie(id, name);
        return;
    }

    void playItem(id, name, resume, context);
}
