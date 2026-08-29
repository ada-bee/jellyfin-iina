import type { JellyfinBaseItem } from "../shared/jellyfin";

import { ui } from "./dom";
import { buildJellyfinImageUrl } from "./images";
import { state } from "./state";
import { formatEpisodeNumber, formatRuntime } from "./utils";

export interface ListCardOptions {
    showSeriesName?: boolean;
    showEpisodeNumber?: boolean;
    useEpisodeThumbnail?: boolean;
    disableEpisodeThumbnailFallback?: boolean;
    useSeriesBackdropFallback?: boolean;
    showSeriesEpisodeCounts?: boolean;
}

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

export function showLoginView(): void {
    ui.loginView.classList.remove("hidden");
    ui.browseView.classList.add("hidden");
}

export function showBrowseView(): void {
    ui.loginView.classList.add("hidden");
    ui.browseView.classList.remove("hidden");
}

export function updateServerHeader(displayName: string, hostName: string): void {
    ui.serverName.textContent = displayName || hostName;
    ui.serverHost.textContent = hostName;
}

export function showLoading(): void {
    ui.loading.classList.remove("hidden");
    ui.content.classList.add("hidden");
    ui.errorState.classList.add("hidden");
}

export function hideLoading(): void {
    ui.loading.classList.add("hidden");
    ui.content.classList.remove("hidden");
}

export function renderEmptyState(message: string): void {
    const emptyState = document.createElement("div");
    emptyState.className = "empty-state";
    emptyState.textContent = message;
    ui.content.replaceChildren(emptyState);
}

export function showError(message: string): void {
    ui.loading.classList.add("hidden");
    ui.content.classList.add("hidden");
    ui.errorState.classList.remove("hidden");
    ui.errorMessage.textContent = message;
}

export function updateTitle(title: string): void {
    ui.sectionTitle.textContent = title;
    const showHeader = state.breadcrumb.length > 0 || title !== "Home";
    ui.sectionHeader.classList.toggle("hidden", !showHeader);
    ui.backBtn.classList.toggle("hidden", state.breadcrumb.length === 0);
}

export function renderListCards(items: JellyfinBaseItem[], options: ListCardOptions = {}): void {
    const list = document.createElement("div");
    list.className = "media-list";

    items.forEach(item => {
        list.appendChild(buildListCardElement(item, options));
    });

    ui.content.replaceChildren(list);
}

export function renderHomeSections(
    nextUpItems: JellyfinBaseItem[],
    recentMovies: JellyfinBaseItem[],
    recentEpisodes: JellyfinBaseItem[]
): void {
    const sections = [
        { title: "Up Next", items: nextUpItems },
        { title: "Latest Movies", items: recentMovies },
        { title: "Latest TV", items: recentEpisodes }
    ];
    const fragment = document.createDocumentFragment();

    sections.forEach(section => {
        const sectionEl = document.createElement("div");
        sectionEl.className = "home-section";

        const title = document.createElement("h3");
        title.textContent = section.title;
        sectionEl.appendChild(title);

        const items = section.items || [];
        if (items.length === 0) {
            const emptyState = document.createElement("div");
            emptyState.className = "empty-state";
            emptyState.setAttribute("data-empty", "true");
            emptyState.textContent = "No items found";
            sectionEl.appendChild(emptyState);
        } else {
            const list = document.createElement("div");
            list.className = "media-list";
            items.forEach(item => {
                const isUpNextSection = section.title === "Up Next";
                list.appendChild(buildListCardElement(item, {
                    showSeriesName: isUpNextSection || section.title === "Latest TV",
                    showEpisodeNumber: true,
                    ...(isUpNextSection ? getNextUpImageOptions() : {})
                }));
            });
            sectionEl.appendChild(list);
        }

        fragment.appendChild(sectionEl);
    });

    ui.content.replaceChildren(fragment);
}

export function renderSeriesOverview(nextUpItem: JellyfinBaseItem | null, seasons: JellyfinBaseItem[]): void {
    const fragment = document.createDocumentFragment();

    if (nextUpItem) {
        const section = document.createElement("div");
        section.className = "home-section";

        const title = document.createElement("h3");
        title.textContent = "Up Next";
        section.appendChild(title);

        const list = document.createElement("div");
        list.className = "media-list";
        list.appendChild(buildListCardElement(nextUpItem, {
            showSeriesName: false,
            showEpisodeNumber: true,
            ...getNextUpImageOptions()
        }));
        section.appendChild(list);

        fragment.appendChild(section);
    }

    if (seasons.length > 0) {
        const section = document.createElement("div");
        section.className = "season-section";

        const title = document.createElement("h3");
        title.textContent = "Seasons";
        section.appendChild(title);

        const grid = document.createElement("div");
        grid.className = "season-grid";
        seasons.forEach(season => {
            grid.appendChild(buildSeasonCardElement(season));
        });
        section.appendChild(grid);

        fragment.appendChild(section);
    }

    ui.content.replaceChildren(fragment);
}

export function renderSearchResults(items: JellyfinBaseItem[]): void {
    const grouped: Record<string, JellyfinBaseItem[]> = {
        Movie: [],
        Series: [],
        Episode: []
    };

    items.forEach(item => {
        if (item.Type && grouped[item.Type]) {
            grouped[item.Type].push(item);
        }
    });

    const sections = [
        {
            title: "Movies",
            items: grouped.Movie,
            options: { showSeriesName: false, showEpisodeNumber: false, useEpisodeThumbnail: true }
        },
        {
            title: "Shows",
            items: grouped.Series,
            options: {
                showSeriesName: false,
                showEpisodeNumber: false,
                useEpisodeThumbnail: true,
                showSeriesEpisodeCounts: true
            }
        },
        {
            title: "Episodes",
            items: grouped.Episode,
            options: { showSeriesName: true, showEpisodeNumber: true, useEpisodeThumbnail: true }
        }
    ];

    const visibleSections = sections.filter(section => section.items.length > 0);
    if (visibleSections.length === 0) {
        renderEmptyState("No results found");
        return;
    }

    const fragment = document.createDocumentFragment();
    visibleSections.forEach(section => {
        const sectionEl = document.createElement("div");
        sectionEl.className = "result-section";

        const title = document.createElement("h3");
        title.textContent = section.title;
        sectionEl.appendChild(title);

        const list = document.createElement("div");
        list.className = "media-list";
        section.items.forEach(item => {
            list.appendChild(buildListCardElement(item, section.options));
        });
        sectionEl.appendChild(list);

        fragment.appendChild(sectionEl);
    });

    ui.content.replaceChildren(fragment);
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

    const id = card.dataset.id || "";
    const name = card.dataset.name || "";
    const type = card.dataset.type || "";
    const resume = Number.parseInt(card.dataset.resume || "0", 10) || 0;

    return {
        id,
        name,
        type,
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

    if (imageElement.classList.contains("season-thumb")) {
        handleImageFallback(imageElement);
        return;
    }

    if (imageElement.classList.contains("list-thumb")) {
        handleImageFallback(imageElement);
    }
}

function buildSeasonCardElement(season: JellyfinBaseItem): HTMLElement {
    const imageUrl = getImageUrl(season.Id || "", "Primary", 240);
    const seriesPosterUrl = state.currentSeries?.id
        ? getImageUrl(state.currentSeries.id, "Primary", 240)
        : "";
    const seasonName = season.Name ? String(season.Name) : "";

    const card = document.createElement("div");
    card.className = "season-card list-card";
    card.dataset.id = season.Id || "";
    card.dataset.name = seasonName;
    card.dataset.type = "Season";
    card.dataset.resume = "0";
    card.dataset.seriesId = state.currentSeries?.id || "";
    card.dataset.seasonId = season.Id || "";
    card.setAttribute("data-clickable", "");
    card.tabIndex = 0;
    card.setAttribute("role", "button");

    const poster = document.createElement("div");
    poster.className = "season-poster";

    const image = document.createElement("img");
    image.className = "season-thumb";
    image.src = imageUrl;
    image.dataset.fallback = seriesPosterUrl;
    image.alt = seasonName;
    image.loading = "lazy";

    poster.appendChild(image);
    card.appendChild(poster);

    const title = document.createElement("div");
    title.className = "season-title";
    title.textContent = seasonName;
    card.appendChild(title);

    return card;
}

function buildListCardElement(item: JellyfinBaseItem, options: ListCardOptions): HTMLElement {
    const metadata = buildMetadataText(item, options);
    const runtime = formatRuntime(item.RunTimeTicks || undefined);
    const durationLabel = buildDurationLabelElement(item, runtime, options);
    const progressBar = buildThumbProgressElement(item);

    const seriesId = item.SeriesId || "";
    const seasonId = item.SeasonId || item.ParentId || "";
    const episodeIndex = item.IndexNumber !== undefined && item.IndexNumber !== null
        ? String(item.IndexNumber)
        : "";
    const thumbnailUrl = getThumbnailUrl(item, options);
    const useEpisodeFallback = Boolean(
        options.useEpisodeThumbnail &&
        item.Type === "Episode" &&
        seriesId &&
        !options.disableEpisodeThumbnailFallback
    );
    const useSeriesBackdropFallback = Boolean(
        options.useSeriesBackdropFallback &&
        item.Type === "Episode" &&
        seriesId
    );
    const useBackdropFallback = item.Type === "Movie" || item.Type === "Series";
    const fallbackThumbnailUrl = useEpisodeFallback
        ? getImageUrl(seriesId, "Thumb", 160)
        : (useSeriesBackdropFallback
            ? getImageUrl(seriesId, "Backdrop", 320)
            : (useBackdropFallback ? getImageUrl(item.Id || "", "Backdrop", 320) : ""));
    const displayName = item.Name ? String(item.Name) : "";

    const card = document.createElement("div");
    card.className = "list-card";
    card.dataset.id = item.Id || "";
    card.dataset.name = displayName;
    card.dataset.type = item.Type || "";
    card.dataset.resume = String(item.UserData?.PlaybackPositionTicks || 0);
    card.dataset.seriesId = seriesId;
    card.dataset.seasonId = seasonId;
    card.dataset.episodeIndex = episodeIndex;
    card.setAttribute("data-clickable", "");
    card.tabIndex = 0;
    card.setAttribute("role", "button");

    const thumbWrapper = document.createElement("div");
    thumbWrapper.className = "thumb-wrapper";

    const image = document.createElement("img");
    image.className = "list-thumb";
    image.src = thumbnailUrl;
    image.dataset.fallback = fallbackThumbnailUrl;
    image.dataset.itemId = item.Id || "";
    image.dataset.type = item.Type || "";
    image.alt = displayName;
    image.loading = "lazy";
    thumbWrapper.appendChild(image);

    const playOverlay = document.createElement("div");
    playOverlay.className = "play-overlay";
    playOverlay.textContent = "\u25B6";
    thumbWrapper.appendChild(playOverlay);

    if (progressBar) {
        thumbWrapper.appendChild(progressBar);
    }

    const listBody = document.createElement("div");
    listBody.className = "list-body";

    const title = document.createElement("div");
    title.className = "list-title";
    title.textContent = displayName;
    listBody.appendChild(title);

    const meta = document.createElement("div");
    meta.className = "list-meta";
    meta.textContent = metadata;
    listBody.appendChild(meta);

    card.appendChild(thumbWrapper);
    card.appendChild(listBody);

    if (durationLabel) {
        card.appendChild(durationLabel);
    }

    return card;
}

function buildDurationLabelElement(item: JellyfinBaseItem, runtime: string, options: ListCardOptions): HTMLElement | null {
    if (options.showSeriesEpisodeCounts && item.Type === "Series") {
        const totalEpisodes = item.RecursiveItemCount || item.ChildCount || 0;
        const userData = item.UserData as (typeof item.UserData & { PlayedItemCount?: number }) | undefined;
        const playedCount = userData?.PlayedItemCount;
        const unplayedCount = userData?.UnplayedItemCount;
        const watchedEpisodes = playedCount !== undefined && playedCount !== null
            ? playedCount
            : (unplayedCount !== undefined && unplayedCount !== null
                ? Math.max(totalEpisodes - unplayedCount, 0)
                : 0);
        if (totalEpisodes > 0) {
            const label = document.createElement("div");
            label.className = "list-duration";
            label.textContent = `${watchedEpisodes}/${totalEpisodes}`;
            return label;
        }
        return null;
    }

    if (runtime) {
        const label = document.createElement("div");
        label.className = "list-duration";
        label.textContent = runtime;
        return label;
    }

    return null;
}

function buildMetadataText(item: JellyfinBaseItem, options: ListCardOptions): string {
    const metaParts: Array<string | number> = [];

    if (options.showEpisodeNumber && item.Type === "Episode") {
        metaParts.push(formatEpisodeNumber(item.ParentIndexNumber, item.IndexNumber));
    }

    if (options.showSeriesName !== false && item.SeriesName) {
        metaParts.push(String(item.SeriesName));
    }

    if (item.Type !== "Episode" && item.ProductionYear) {
        metaParts.push(item.ProductionYear);
    }

    return metaParts.filter(Boolean).join(" \u2022 ");
}

function hasProgress(item: JellyfinBaseItem): boolean {
    return Boolean(item.UserData?.PlaybackPositionTicks && item.RunTimeTicks);
}

function buildThumbProgressElement(item: JellyfinBaseItem): HTMLElement | null {
    if (!item || item.Type === "Series") {
        return null;
    }

    if (item.UserData?.Played) {
        const progress = document.createElement("div");
        progress.className = "thumb-progress";

        const fill = document.createElement("div");
        fill.className = "thumb-progress-fill thumb-progress-fill--complete";
        fill.style.width = "100%";
        progress.appendChild(fill);

        return progress;
    }

    if (!hasProgress(item)) {
        return null;
    }

    const runtimeTicks = item.RunTimeTicks || 0;
    const positionTicks = item.UserData?.PlaybackPositionTicks || 0;
    const progress = runtimeTicks ? (positionTicks / runtimeTicks) * 100 : 0;
    if (progress < 1) {
        return null;
    }

    const progressEl = document.createElement("div");
    progressEl.className = "thumb-progress";

    const fill = document.createElement("div");
    fill.className = "thumb-progress-fill thumb-progress-fill--partial";
    fill.style.width = `${Math.min(progress, 100)}%`;
    progressEl.appendChild(fill);

    return progressEl;
}

function getImageUrl(itemId: string, imageType: string = "Primary", maxWidth: number = 120): string {
    return buildJellyfinImageUrl({
        serverUrl: state.serverUrl,
        accessToken: state.accessToken,
        itemId,
        imageType,
        maxWidth
    });
}

function getThumbnailUrl(item: JellyfinBaseItem, options: ListCardOptions = {}): string {
    if (!item) {
        return "";
    }

    if (options.useEpisodeThumbnail && item.Type === "Episode" && item.Id) {
        return getImageUrl(item.Id, "Primary", 160);
    }

    const imageId = item.Type === "Episode" && item.SeriesId ? item.SeriesId : item.Id || "";
    return getImageUrl(imageId, "Thumb", 160);
}

function getNextUpImageOptions(): ListCardOptions {
    if (state.preferEpisodeImagesInNextUp) {
        return {
            useEpisodeThumbnail: true,
            disableEpisodeThumbnailFallback: true
        };
    }

    return {
        useEpisodeThumbnail: false,
        useSeriesBackdropFallback: true
    };
}

function handleImageFallback(imageElement: HTMLImageElement): void {
    if (!imageElement) {
        return;
    }

    const fallbackUrl = imageElement.dataset.fallback || "";
    if (fallbackUrl && imageElement.dataset.fallbackApplied !== "true") {
        imageElement.dataset.fallbackApplied = "true";
        imageElement.src = fallbackUrl;
        return;
    }

    const itemId = imageElement.dataset.itemId || "";
    const type = imageElement.dataset.type || "";
    const usedBackdrop = imageElement.dataset.backdropApplied === "true";
    if (!usedBackdrop && itemId && (type === "Movie" || type === "Series")) {
        imageElement.dataset.backdropApplied = "true";
        imageElement.src = getImageUrl(itemId, "Backdrop", 320);
        return;
    }

    imageElement.style.display = "none";
}
