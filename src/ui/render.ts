import type { JellyfinBaseItem } from "../shared/jellyfin";

import { TICKS_PER_MINUTE } from "./constants";
import { ui } from "./dom";
import { state, type SearchFilter } from "./state";
import { formatEpisodeNumber, formatPaddedEpisodeNumber, formatRuntime } from "./utils";

export interface ListCardOptions {
    showSeriesName?: boolean;
    showEpisodeNumber?: boolean;
    useEpisodeThumbnail?: boolean;
    disableEpisodeThumbnailFallback?: boolean;
    useSeriesBackdropFallback?: boolean;
    showSeriesEpisodeCounts?: boolean;
    homePoster?: boolean;
    homeThumbnail?: boolean;
    libraryPoster?: boolean;
    usePosterImage?: boolean;
    hideRuntime?: boolean;
}

type HomeSectionId = "continue-watching" | "new" | "movies" | "series";

export interface CardContext {
    id: string;
    name: string;
    type: string;
    resume: number;
    context: {
        seriesId: string;
        seasonId: string;
        episodeIndex: number | null;
    };
}

let cachedSearchResults: JellyfinBaseItem[] = [];
let homeRailResizeHandlerInstalled = false;
let libraryGridObserver: IntersectionObserver | null = null;
let libraryGridLoadMore: (() => void) | null = null;

export function showLoginView(): void {
    ui.loginView.classList.remove("hidden");
    ui.browseView.classList.add("hidden");
}

export function showBrowseView(): void {
    ui.loginView.classList.add("hidden");
    ui.browseView.classList.remove("hidden");
}

export function showLoading(): void {
    disconnectLibraryGridObserver();
    ui.loading.classList.remove("hidden");
    ui.content.classList.add("hidden");
    ui.errorState.classList.add("hidden");
}

export function hideLoading(): void {
    ui.loading.classList.add("hidden");
    ui.errorState.classList.add("hidden");
    ui.content.classList.remove("hidden");
}

export function renderEmptyState(message: string): void {
    replaceContent(buildFeedbackState(message, getEmptyStateDetail(message)));
}

export function showError(message: string): void {
    ui.loading.classList.add("hidden");
    ui.content.classList.add("hidden");
    ui.errorState.classList.remove("hidden");
    ui.errorMessage.textContent = message;
}

export function updateTitle(title: string): void {
    ui.sectionTitle.textContent = title;
    ui.sectionTitle.setAttribute("aria-label", `Back from ${title}`);

    const showHome = title === "Home" && state.breadcrumb.length === 0 && !state.searchQuery;
    const showSearchFilters = title === "Search Results" && Boolean(state.searchQuery);
    const showSectionHeader = !showHome && !showSearchFilters;
    const canGoBack = state.breadcrumb.length > 0;

    ui.searchFilters.classList.toggle("hidden", !showSearchFilters);
    ui.navigationLayer.classList.toggle("hidden", !showSectionHeader);
    ui.sectionHeader.classList.toggle("hidden", !showSectionHeader);
    ui.backBtn.classList.toggle("hidden", !canGoBack);
    ui.browseView.classList.toggle("home-view", showHome);
    ui.browseView.classList.toggle("searching", showSearchFilters);
}

export function renderListCards(items: JellyfinBaseItem[], options: ListCardOptions = {}): void {
    replaceContent(buildMediaList(items, options));
}

export function renderLibraryGrid(
    items: JellyfinBaseItem[],
    hasMore: boolean,
    onLoadMore: () => void
): void {
    const grid = document.createElement("div");
    grid.className = "library-poster-grid";
    grid.dataset.libraryGrid = "";
    items.forEach(item => grid.appendChild(buildListCardElement(item, getLibraryPosterOptions())));

    replaceContent(grid);
    libraryGridLoadMore = onLoadMore;
    ui.content.classList.add("library-content");
    updateLibraryLoadStatus(hasMore);
}

export function appendLibraryGridItems(items: JellyfinBaseItem[], hasMore: boolean): void {
    const grid = ui.content.querySelector<HTMLElement>("[data-library-grid]");
    if (!grid) {
        return;
    }
    const fragment = document.createDocumentFragment();
    items.forEach(item => fragment.appendChild(buildListCardElement(item, getLibraryPosterOptions())));
    grid.appendChild(fragment);
    updateLibraryLoadStatus(hasMore);
}

export function showLibraryGridLoadError(onRetry: () => void): void {
    disconnectLibraryGridObserver();
    const status = getOrCreateLibraryLoadStatus();
    status.classList.add("library-load-status--error");
    status.removeAttribute("role");
    status.removeAttribute("aria-label");
    const retry = document.createElement("button");
    retry.className = "btn-secondary library-load-retry";
    retry.type = "button";
    retry.textContent = "Try Again";
    retry.addEventListener("click", () => {
        status.replaceChildren(buildLibraryLoadingSpinner());
        status.classList.remove("library-load-status--error");
        status.setAttribute("role", "status");
        status.setAttribute("aria-label", "Loading more titles");
        onRetry();
    });
    status.replaceChildren(retry);
}

export function renderHomeSections(
    continueWatchingItems: JellyfinBaseItem[],
    newestEpisodes: JellyfinBaseItem[],
    recentMovies: JellyfinBaseItem[],
    recentSeries: JellyfinBaseItem[]
): void {
    const home = document.createElement("div");
    home.className = "home-sections";
    const sections: Array<{
        id: HomeSectionId;
        title: string;
        items: JellyfinBaseItem[];
        options: ListCardOptions;
        libraryType?: string;
    }> = [
        {
            id: "continue-watching",
            title: "Continue watching",
            items: continueWatchingItems,
            options: {
                homeThumbnail: true,
                showSeriesName: true,
                showEpisodeNumber: true,
                hideRuntime: true,
                ...getNextUpImageOptions()
            }
        },
        {
            id: "new",
            title: "New episodes",
            items: newestEpisodes,
            options: {
                homeThumbnail: true,
                showSeriesName: true,
                showEpisodeNumber: true,
                hideRuntime: true,
                useEpisodeThumbnail: true
            }
        },
        {
            id: "movies",
            title: "Movies",
            items: recentMovies,
            options: { homePoster: true, usePosterImage: true, showSeriesName: false },
            libraryType: "movies"
        },
        {
            id: "series",
            title: "Series",
            items: recentSeries,
            options: { homePoster: true, usePosterImage: true, showSeriesName: false },
            libraryType: "tvshows"
        }
    ];

    sections.forEach(({ id, title, items, options, libraryType }) => {
        const section = document.createElement("section");
        section.className = "home-shelf";
        const heading = document.createElement("h3");
        if (libraryType) {
            const link = document.createElement("button");
            link.className = "home-section-link";
            link.type = "button";
            link.dataset.homeLibrary = libraryType;
            link.dataset.homeLibraryName = title;
            link.setAttribute("aria-label", `Open ${title}`);
            const label = document.createElement("span");
            label.textContent = title;
            link.append(label, buildDisclosureChevron());
            heading.appendChild(link);
        } else {
            heading.textContent = title;
        }
        section.appendChild(heading);

        if (items.length > 0) {
            const rail = document.createElement("div");
            rail.className = "home-media-rail";
            rail.classList.toggle("home-media-rail--thumbnail", Boolean(options.homeThumbnail));
            const row = document.createElement("div");
            row.className = "home-media-row";
            row.setAttribute("aria-label", title);
            items.forEach(item => row.appendChild(buildListCardElement(item, options)));
            row.addEventListener("scroll", () => updateHomeRailShadow(row), { passive: true });
            const previous = buildHomeRailButton(row, title, -1);
            const next = buildHomeRailButton(row, title, 1);
            rail.append(
                previous,
                next,
                row
            );
            section.appendChild(rail);
        } else {
            const empty = buildFeedbackState("Nothing Here Yet", getHomeEmptyDetail(id));
            empty.classList.add("home-shelf-empty");
            section.appendChild(empty);
        }
        home.appendChild(section);
    });

    replaceContent(home);
    installHomeRailResizeHandler();
    requestAnimationFrame(updateAllHomeRailShadows);
}

function buildDisclosureChevron(): SVGElement {
    const namespace = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(namespace, "svg");
    svg.setAttribute("width", "13");
    svg.setAttribute("height", "13");
    svg.setAttribute("viewBox", "0 0 14 14");
    svg.setAttribute("fill", "none");
    svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS(namespace, "path");
    path.setAttribute("d", "m5 2.5 4 4.5-4 4.5");
    path.setAttribute("stroke", "currentColor");
    path.setAttribute("stroke-width", "1.6");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    svg.appendChild(path);
    return svg;
}

function buildHomeRailButton(row: HTMLElement, sectionTitle: string, direction: -1 | 1): HTMLButtonElement {
    const isPrevious = direction === -1;
    const button = document.createElement("button");
    button.className = `home-scroll-button home-scroll-button--${isPrevious ? "previous" : "next"}`;
    button.type = "button";
    button.setAttribute("aria-label", `${isPrevious ? "Previous" : "Next"} ${sectionTitle}`);
    button.innerHTML = `<svg width="17" height="17" viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="m${isPrevious ? "11.5 3.5-5 5.5 5 5.5" : "6.5 3.5 5 5.5-5 5.5"}" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    button.addEventListener("click", () => {
        row.scrollBy({
            left: direction * row.clientWidth * .8,
            behavior: "smooth"
        });
    });
    return button;
}

function installHomeRailResizeHandler(): void {
    if (homeRailResizeHandlerInstalled) {
        return;
    }
    homeRailResizeHandlerInstalled = true;
    window.addEventListener("resize", updateAllHomeRailShadows, { passive: true });
}

function updateAllHomeRailShadows(): void {
    ui.content.querySelectorAll<HTMLElement>(".home-media-row").forEach(updateHomeRailShadow);
}

function updateHomeRailShadow(row: HTMLElement): void {
    const rail = row.closest<HTMLElement>(".home-media-rail");
    if (!rail) {
        return;
    }
    const maximumScroll = Math.max(row.scrollWidth - row.clientWidth, 0);
    const canScrollLeft = row.scrollLeft > 1;
    const canScrollRight = row.scrollLeft < maximumScroll - 1;
    rail.classList.toggle("can-scroll-left", canScrollLeft);
    rail.classList.toggle("can-scroll-right", canScrollRight);
    const previous = rail.querySelector<HTMLButtonElement>(".home-scroll-button--previous");
    const next = rail.querySelector<HTMLButtonElement>(".home-scroll-button--next");
    if (previous) {
        previous.disabled = !canScrollLeft;
    }
    if (next) {
        next.disabled = !canScrollRight;
    }
}

export function renderSeriesOverview(nextUpItem: JellyfinBaseItem | null, seasons: JellyfinBaseItem[]): void {
    const fragment = document.createDocumentFragment();

    if (nextUpItem) {
        const section = buildContentSection("Up Next");
        section.appendChild(buildMediaList([nextUpItem], {
            showSeriesName: false,
            showEpisodeNumber: true,
            ...getNextUpImageOptions()
        }));
        fragment.appendChild(section);
    }

    if (seasons.length > 0) {
        const section = buildContentSection("Seasons");
        const list = document.createElement("div");
        list.className = "season-list";
        seasons.forEach(season => list.appendChild(buildSeasonCardElement(season)));
        section.appendChild(list);
        fragment.appendChild(section);
    }

    replaceContent(fragment);
}

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

export function findListCard(target: EventTarget | null): HTMLElement | null {
    if (!target || !(target as HTMLElement).closest) {
        return null;
    }
    return (target as HTMLElement).closest(".list-card");
}

export function getCardContext(card: HTMLElement | null): CardContext | null {
    if (!card) {
        return null;
    }

    const resume = Number.parseInt(card.dataset.resume || "0", 10) || 0;
    return {
        id: card.dataset.id || "",
        name: card.dataset.name || "",
        type: card.dataset.type || "",
        resume,
        context: {
            seriesId: card.dataset.seriesId || "",
            seasonId: card.dataset.seasonId || "",
            episodeIndex: card.dataset.episodeIndex
                ? Number.parseInt(card.dataset.episodeIndex, 10)
                : null
        }
    };
}

export function handleContentError(event: Event): void {
    const imageElement = event.target as HTMLImageElement | null;
    if (!imageElement || imageElement.tagName !== "IMG") {
        return;
    }
    if (imageElement.classList.contains("season-thumb") || imageElement.classList.contains("list-thumb")) {
        handleImageFallback(imageElement);
    }
}

function renderFilteredSearchResults(): void {
    const filterType = state.searchFilter === "all"
        ? ""
        : state.searchFilter.charAt(0).toUpperCase() + state.searchFilter.slice(1);
    const visibleItems = filterType
        ? cachedSearchResults.filter(item => item.Type === filterType)
        : cachedSearchResults;

    if (visibleItems.length === 0) {
        renderEmptyState(state.searchFilter === "all" ? "No Results" : `No ${getFilterLabel(state.searchFilter)} Found`);
        return;
    }

    const list = document.createElement("div");
    list.className = "media-list";
    visibleItems.forEach(item => list.appendChild(buildListCardElement(item, getSearchCardOptions(item))));
    replaceContent(list);
}

function buildContentSection(titleText: string): HTMLElement {
    const section = document.createElement("section");
    section.className = "content-section";
    const title = document.createElement("h3");
    title.textContent = titleText;
    section.appendChild(title);
    return section;
}

function buildMediaList(items: JellyfinBaseItem[], options: ListCardOptions): HTMLElement {
    const list = document.createElement("div");
    list.className = "media-list";
    items.forEach(item => list.appendChild(buildListCardElement(item, options)));
    return list;
}

function buildSeasonCardElement(season: JellyfinBaseItem): HTMLElement {
    const seasonName = String(season.Name || "Season");
    const seriesId = state.currentSeries?.id || "";

    const card = document.createElement("div");
    card.className = "season-card list-card";
    applyCardContext(card, season, seasonName, seriesId, season.Id || "");
    card.setAttribute("aria-label", seasonName);

    const artwork = document.createElement("div");
    artwork.className = "season-artwork";

    const image = document.createElement("img");
    image.className = "season-thumb";
    image.src = getImageUrl(season.Id || "", "Primary", 680);
    image.dataset.fallback = getImageUrl(seriesId, "Backdrop", 680);
    image.dataset.itemId = season.Id || "";
    image.dataset.type = "Season";
    image.alt = "";
    image.loading = "lazy";
    artwork.appendChild(image);

    const title = document.createElement("div");
    title.className = "season-title";
    title.textContent = seasonName;
    artwork.appendChild(title);
    card.appendChild(artwork);
    return card;
}

function buildListCardElement(item: JellyfinBaseItem, options: ListCardOptions): HTMLElement {
    const displayName = String(item.Name || "Untitled");
    const seriesId = item.SeriesId || "";
    const seasonId = item.SeasonId || item.ParentId || "";

    const card = document.createElement("div");
    card.className = "list-card";
    card.classList.toggle("home-poster-card", Boolean(options.homePoster));
    card.classList.toggle("home-thumbnail-card", Boolean(options.homeThumbnail));
    card.classList.toggle("library-poster-card", Boolean(options.libraryPoster));
    applyCardContext(card, item, displayName, seriesId, seasonId);

    const thumbWrapper = document.createElement("div");
    thumbWrapper.className = "thumb-wrapper";

    const image = document.createElement("img");
    image.className = "list-thumb";
    image.src = getThumbnailUrl(item, options);
    image.dataset.fallback = getFallbackThumbnailUrl(item, options);
    image.dataset.itemId = item.Id || "";
    image.dataset.type = item.Type || "";
    image.alt = "";
    image.loading = "lazy";
    thumbWrapper.appendChild(image);
    const artworkOnly = options.homePoster || options.libraryPoster;
    if (!artworkOnly) {
        thumbWrapper.appendChild(buildPlayOverlay());
    }

    const remainingLabel = getRemainingLabel(item);
    if (remainingLabel && !artworkOnly) {
        const label = document.createElement("div");
        label.className = "resume-label";
        label.textContent = remainingLabel;
        thumbWrapper.appendChild(label);
    }

    const progress = buildThumbProgressElement(item);
    if (progress) {
        thumbWrapper.appendChild(progress);
    }
    if (item.UserData?.Played) {
        thumbWrapper.appendChild(buildWatchedIndicator());
    }

    const copy = getCardCopy(item, options);
    const remainingText = remainingLabel ? `, ${remainingLabel}` : "";
    const accessibleName = `${copy.title}${copy.metadata ? `, ${copy.metadata}` : ""}${remainingText}`;
    card.setAttribute("aria-label", accessibleName);
    card.title = accessibleName;
    const body = document.createElement("div");
    body.className = "list-body";

    const title = document.createElement("div");
    title.className = "list-title";
    title.textContent = copy.title;
    body.appendChild(title);

    if (copy.metadata) {
        const metadata = document.createElement("div");
        metadata.className = "list-meta";
        metadata.textContent = copy.metadata;
        body.appendChild(metadata);
    }

    card.appendChild(thumbWrapper);
    if (!artworkOnly) {
        card.appendChild(body);
    }
    return card;
}

function applyCardContext(
    card: HTMLElement,
    item: JellyfinBaseItem,
    name: string,
    seriesId: string,
    seasonId: string
): void {
    card.dataset.id = item.Id || "";
    card.dataset.name = name;
    card.dataset.type = item.Type || "";
    card.dataset.resume = String(item.UserData?.PlaybackPositionTicks || 0);
    card.dataset.seriesId = seriesId;
    card.dataset.seasonId = seasonId;
    card.dataset.episodeIndex = item.IndexNumber === undefined || item.IndexNumber === null
        ? ""
        : String(item.IndexNumber);
    card.setAttribute("data-clickable", "");
    card.tabIndex = 0;
    card.setAttribute("role", "button");
}

function getCardCopy(item: JellyfinBaseItem, options: ListCardOptions): { title: string; metadata: string } {
    const itemName = String(item.Name || "Untitled");
    const runtime = formatRuntime(item.RunTimeTicks || undefined);
    const metadata: string[] = [];

    if (item.Type === "Episode") {
        if (options.homeThumbnail) {
            if (item.SeriesName) {
                metadata.push(String(item.SeriesName));
            }
            if (options.showEpisodeNumber) {
                metadata.push(formatPaddedEpisodeNumber(item.ParentIndexNumber, item.IndexNumber));
            }
            return { title: itemName, metadata: metadata.join(" · ") };
        }

        const seriesIsTitle = options.showSeriesName !== false && Boolean(item.SeriesName);
        if (options.showEpisodeNumber) {
            const episodeNumber = formatEpisodeNumber(item.ParentIndexNumber, item.IndexNumber);
            if (episodeNumber) {
                metadata.push(episodeNumber.replace("E", ", E"));
            }
        }
        if (seriesIsTitle) {
            metadata.push(itemName);
        } else if (options.showSeriesName !== false && item.SeriesName) {
            metadata.push(String(item.SeriesName));
        }
        if (!options.hideRuntime && !hasProgress(item) && runtime) {
            metadata.push(runtime);
        }
        return {
            title: seriesIsTitle ? String(item.SeriesName) : itemName,
            metadata: metadata.join(" · ")
        };
    }

    if (item.ProductionYear) {
        metadata.push(String(item.ProductionYear));
    }
    if (!options.hideRuntime && runtime) {
        metadata.push(runtime);
    }
    const episodeCount = options.showSeriesEpisodeCounts ? getSeriesEpisodeCount(item) : "";
    if (episodeCount) {
        metadata.push(episodeCount);
    }
    return { title: itemName, metadata: metadata.join(" · ") };
}

function getSeriesEpisodeCount(item: JellyfinBaseItem): string {
    const total = item.RecursiveItemCount || item.ChildCount || 0;
    if (!total) {
        return "";
    }
    const userData = item.UserData as (typeof item.UserData & { PlayedItemCount?: number }) | undefined;
    const played = userData?.PlayedItemCount ?? Math.max(total - (userData?.UnplayedItemCount || 0), 0);
    return `${played} of ${total} watched`;
}

function buildPlayOverlay(): HTMLElement {
    const overlay = document.createElement("div");
    overlay.className = "play-overlay";
    const button = document.createElement("span");
    button.className = "play-button";
    button.setAttribute("aria-hidden", "true");
    button.innerHTML = '<svg width="19" height="19" viewBox="0 0 19 19"><path d="M6.7 4.2c0-.7.8-1.1 1.4-.7l7 4.6c.5.3.5 1.1 0 1.4l-7 4.6c-.6.4-1.4 0-1.4-.7V4.2Z" fill="currentColor"/></svg>';
    overlay.appendChild(button);
    return overlay;
}

function buildWatchedIndicator(): HTMLElement {
    const indicator = document.createElement("div");
    indicator.className = "watched-indicator";
    indicator.setAttribute("title", "Watched");
    indicator.innerHTML = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="m3 7.2 2.5 2.5L11.2 4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    return indicator;
}

function hasProgress(item: JellyfinBaseItem): boolean {
    return Boolean(item.UserData?.PlaybackPositionTicks && item.RunTimeTicks && !item.UserData.Played);
}

function getRemainingLabel(item: JellyfinBaseItem): string {
    if (!hasProgress(item)) {
        return "";
    }
    const remainingTicks = Math.max((item.RunTimeTicks || 0) - (item.UserData?.PlaybackPositionTicks || 0), 0);
    const minutes = Math.max(Math.ceil(remainingTicks / TICKS_PER_MINUTE), 1);
    return `${minutes} min left`;
}

function buildThumbProgressElement(item: JellyfinBaseItem): HTMLElement | null {
    if (!hasProgress(item)) {
        return null;
    }
    const runtime = item.RunTimeTicks || 0;
    const position = item.UserData?.PlaybackPositionTicks || 0;
    const percent = runtime ? Math.min((position / runtime) * 100, 100) : 0;
    if (percent < 1) {
        return null;
    }

    const progress = document.createElement("div");
    progress.className = "thumb-progress";
    progress.setAttribute("role", "progressbar");
    progress.setAttribute("aria-valuenow", String(Math.round(percent)));
    progress.setAttribute("aria-valuemin", "0");
    progress.setAttribute("aria-valuemax", "100");
    progress.setAttribute("aria-valuetext", `${Math.round(percent)}% watched`);

    const fill = document.createElement("div");
    fill.className = "thumb-progress-fill";
    fill.style.width = `${percent}%`;
    progress.appendChild(fill);
    return progress;
}

function buildFeedbackState(titleText: string, detailText: string): HTMLElement {
    const feedback = document.createElement("div");
    feedback.className = "feedback-state feedback-state--inline";

    const icon = document.createElement("div");
    icon.className = "feedback-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.innerHTML = '<svg width="34" height="34" viewBox="0 0 34 34" fill="none"><circle cx="14" cy="14" r="8.5" stroke="currentColor" stroke-width="1.5"/><path d="m20.5 20.5 6 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';

    const title = document.createElement("h3");
    title.textContent = titleText;
    const detail = document.createElement("p");
    detail.textContent = detailText;
    feedback.append(icon, title, detail);
    return feedback;
}

function getImageUrl(itemId: string, imageType: string = "Primary", maxWidth: number = 680): string {
    if (!state.serverUrl || !itemId) {
        return "";
    }
    try {
        const baseUrl = new URL(state.serverUrl);
        baseUrl.search = "";
        baseUrl.hash = "";
        baseUrl.pathname = `${baseUrl.pathname.replace(/\/+$/, "")}/Items/${encodeURIComponent(itemId)}/Images/${encodeURIComponent(imageType)}`;
        baseUrl.searchParams.set("maxWidth", String(maxWidth));
        baseUrl.searchParams.set("quality", "90");
        return baseUrl.toString();
    } catch (error) {
        return "";
    }
}

function getThumbnailUrl(item: JellyfinBaseItem, options: ListCardOptions = {}): string {
    if (options.usePosterImage) {
        const imageId = item.Type === "Episode" && item.SeriesId ? item.SeriesId : item.Id || "";
        return getImageUrl(imageId, "Primary", 420);
    }
    if (options.useEpisodeThumbnail && item.Type === "Episode" && item.Id) {
        return getImageUrl(item.Id, "Primary");
    }
    const imageId = item.Type === "Episode" && item.SeriesId ? item.SeriesId : item.Id || "";
    return getImageUrl(imageId, "Thumb");
}

function getFallbackThumbnailUrl(item: JellyfinBaseItem, options: ListCardOptions): string {
    const seriesId = item.SeriesId || "";
    if (options.usePosterImage) {
        if (item.Type === "Episode" && item.Id) {
            return getImageUrl(item.Id, "Primary", 420);
        }
        return getImageUrl(item.Id || "", "Backdrop", 680);
    }
    if (options.useEpisodeThumbnail && item.Type === "Episode" && seriesId && !options.disableEpisodeThumbnailFallback) {
        return getImageUrl(seriesId, "Thumb");
    }
    if (options.useSeriesBackdropFallback && item.Type === "Episode" && seriesId) {
        return getImageUrl(seriesId, "Backdrop");
    }
    if (item.Type === "Movie" || item.Type === "Series") {
        return getImageUrl(item.Id || "", "Backdrop");
    }
    return "";
}

function getNextUpImageOptions(): ListCardOptions {
    return state.preferEpisodeImagesInNextUp
        ? { useEpisodeThumbnail: true, disableEpisodeThumbnailFallback: true }
        : { useEpisodeThumbnail: false, useSeriesBackdropFallback: true };
}

function getLibraryPosterOptions(): ListCardOptions {
    return {
        libraryPoster: true,
        usePosterImage: true,
        showSeriesName: false
    };
}

function replaceContent(...nodes: Array<Node | string>): void {
    disconnectLibraryGridObserver();
    libraryGridLoadMore = null;
    ui.content.classList.remove("library-content");
    ui.content.replaceChildren(...nodes);
}

function updateLibraryLoadStatus(hasMore: boolean): void {
    disconnectLibraryGridObserver();
    ui.content.querySelector("[data-library-load-status]")?.remove();
    if (!hasMore || !libraryGridLoadMore) {
        return;
    }

    const status = getOrCreateLibraryLoadStatus();
    requestAnimationFrame(() => requestAnimationFrame(() => {
        if (status.isConnected && libraryGridLoadMore) {
            observeLibraryLoadStatus(status);
        }
    }));
}

function getOrCreateLibraryLoadStatus(): HTMLElement {
    const existing = ui.content.querySelector<HTMLElement>("[data-library-load-status]");
    if (existing) {
        return existing;
    }
    const status = document.createElement("div");
    status.className = "library-load-status";
    status.dataset.libraryLoadStatus = "";
    status.setAttribute("role", "status");
    status.setAttribute("aria-label", "Loading more titles");
    status.appendChild(buildLibraryLoadingSpinner());
    ui.content.appendChild(status);
    return status;
}

function buildLibraryLoadingSpinner(): HTMLElement {
    const spinner = document.createElement("span");
    spinner.className = "library-loading-spinner";
    spinner.setAttribute("aria-hidden", "true");
    return spinner;
}

function observeLibraryLoadStatus(status: HTMLElement): void {
    if (!libraryGridLoadMore) {
        return;
    }
    libraryGridObserver = new IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting)) {
            libraryGridLoadMore?.();
        }
    }, { rootMargin: "360px 0px" });
    libraryGridObserver.observe(status);
}

function disconnectLibraryGridObserver(): void {
    libraryGridObserver?.disconnect();
    libraryGridObserver = null;
}

function getSearchCardOptions(item: JellyfinBaseItem): ListCardOptions {
    if (item.Type === "Episode") {
        return { showSeriesName: true, showEpisodeNumber: true, useEpisodeThumbnail: true };
    }
    if (item.Type === "Series") {
        return { showSeriesName: false, showSeriesEpisodeCounts: true };
    }
    return { showSeriesName: false };
}

function handleImageFallback(image: HTMLImageElement): void {
    const fallbackUrl = image.dataset.fallback || "";
    if (fallbackUrl && image.dataset.fallbackApplied !== "true") {
        image.dataset.fallbackApplied = "true";
        image.src = fallbackUrl;
        return;
    }

    const itemId = image.dataset.itemId || "";
    const type = image.dataset.type || "";
    if (image.dataset.backdropApplied !== "true" && itemId && (type === "Movie" || type === "Series")) {
        image.dataset.backdropApplied = "true";
        image.src = getImageUrl(itemId, "Backdrop");
        return;
    }
    image.style.display = "none";
}

function getEmptyStateDetail(message: string): string {
    return message.toLowerCase().includes("result")
        ? "Try a different title or change the filter."
        : "New items will appear here when they’re available.";
}

function getHomeEmptyDetail(section: HomeSectionId): string {
    if (section === "continue-watching") {
        return "Partially watched movies and your next episodes will appear here.";
    }
    return "Newly added titles will appear here.";
}

function getFilterLabel(filter: SearchFilter): string {
    if (filter === "movie") {
        return "Movies";
    }
    if (filter === "series") {
        return "Series";
    }
    return "Episodes";
}
