import type { JellyfinBaseItem } from "../../jellyfin/types";
import {
    buildMediaDetailsViewModel,
    getProgressPercent,
    getSeriesPlayLabel,
    type EpisodeLoadState,
    type MediaDetailsViewModel
} from "../viewModels";
import { setBackdropDetail } from "../backdropContext";
import { ui } from "../dom";
import { scheduleSeasonMenuLabelUpdate } from "../seasonMenu";
import {
    buildMediaList,
    buildThumbProgressElement,
    buildWatchedIndicator,
    getImageUrl
} from "./cards";
import { buildLibraryLoadingSpinner, replaceContent } from "./content";
import { buildDisclosureChevron } from "./elements";
import { getDetailPlaybackLabel } from "../artwork";

export function renderMovieDetails(item: JellyfinBaseItem): void {
    const details = buildMediaDetails(item, buildMediaDetailsViewModel(item), item);
    details.classList.add("movie-details");
    replaceContent(details);
    setBackdropDetail(item);
}

export function renderSeriesDetails(
    item: JellyfinBaseItem,
    seasons: JellyfinBaseItem[],
    selectedSeasonId: string,
    episodes: JellyfinBaseItem[],
    nextUpItem: JellyfinBaseItem | null,
    episodeLoadState: EpisodeLoadState
): void {
    const nextUpLabel = nextUpItem ? getSeriesPlayLabel(nextUpItem) : "";
    const details = buildMediaDetails(
        item,
        buildMediaDetailsViewModel(item, seasons.length),
        nextUpItem,
        nextUpLabel
    );
    details.classList.add("series-details");
    details.appendChild(buildSeriesEpisodesSection(seasons, selectedSeasonId, episodes, episodeLoadState));
    replaceContent(details);
    setBackdropDetail(item);
    scheduleSeasonMenuLabelUpdate();
}

export function renderSeriesEpisodes(
    seasons: JellyfinBaseItem[],
    selectedSeasonId: string,
    episodes: JellyfinBaseItem[],
    episodeLoadState: EpisodeLoadState
): boolean {
    const currentSection = ui.content.querySelector<HTMLElement>(".series-episodes");
    if (!currentSection) {
        return false;
    }
    currentSection.replaceWith(buildSeriesEpisodesSection(
        seasons,
        selectedSeasonId,
        episodes,
        episodeLoadState
    ));
    scheduleSeasonMenuLabelUpdate();
    return true;
}

function buildMediaDetails(
    item: JellyfinBaseItem,
    viewModel: MediaDetailsViewModel,
    playbackItem: JellyfinBaseItem | null,
    playbackLabel: string = ""
): HTMLElement {
    const details = document.createElement("article");
    details.className = "media-details";
    details.appendChild(buildMediaDetailArtwork(item, playbackItem, playbackLabel));
    details.appendChild(buildMediaDetailInfo(viewModel));
    return details;
}

function buildMediaDetailInfo(viewModel: MediaDetailsViewModel): HTMLElement {
    const info = document.createElement("div");
    info.className = "media-detail-info";

    if (viewModel.metadata) {
        const metadata = document.createElement("p");
        metadata.className = "media-detail-meta";
        metadata.textContent = viewModel.metadata;
        info.appendChild(metadata);
    }
    if (viewModel.watched) {
        info.appendChild(buildMediaDetailWatchedState());
    }
    appendMediaDetailCopy(info, viewModel);
    return info;
}

function appendMediaDetailCopy(container: HTMLElement, viewModel: MediaDetailsViewModel): void {
    if (viewModel.tagline) {
        const taglineElement = document.createElement("p");
        taglineElement.className = "media-detail-tagline";
        taglineElement.textContent = viewModel.tagline;
        container.appendChild(taglineElement);
    }
    if (viewModel.overview) {
        const overview = document.createElement("p");
        overview.className = "media-detail-overview";
        overview.textContent = viewModel.overview;
        container.appendChild(overview);
    }
}

function buildMediaDetailArtwork(
    item: JellyfinBaseItem,
    playbackItem: JellyfinBaseItem | null,
    playbackLabel: string
): HTMLElement {
    const artwork = buildMediaDetailArtworkContainer(item, playbackItem, playbackLabel);
    artwork.appendChild(buildMediaDetailImage(item));
    appendMediaDetailPlaybackState(artwork, playbackItem);
    return artwork;
}

function buildMediaDetailArtworkContainer(
    item: JellyfinBaseItem,
    playbackItem: JellyfinBaseItem | null,
    playbackLabel: string
): HTMLElement {
    if (!playbackItem) {
        const artwork = document.createElement("div");
        artwork.className = "media-detail-artwork";
        return artwork;
    }
    const artwork = document.createElement("button");
    artwork.className = "media-detail-artwork";
    artwork.type = "button";
    applyDetailPlaybackContext(artwork, playbackItem);
    const label = getDetailPlaybackLabel(item, playbackItem, playbackLabel);
    artwork.setAttribute("aria-label", label);
    artwork.title = label;
    return artwork;
}

function buildMediaDetailImage(item: JellyfinBaseItem): HTMLImageElement {
    const image = document.createElement("img");
    image.className = "media-detail-image";
    image.src = getImageUrl(item.Id || "", "Thumb", 1000);
    image.dataset.fallback = getImageUrl(item.Id || "", "Backdrop", 1000);
    image.dataset.itemId = item.Id || "";
    image.dataset.type = item.Type || "";
    image.alt = "";
    return image;
}

function appendMediaDetailPlaybackState(
    artwork: HTMLElement,
    playbackItem: JellyfinBaseItem | null
): void {
    const progress = playbackItem
        ? buildThumbProgressElement(getProgressPercent(playbackItem))
        : null;
    if (progress) {
        artwork.appendChild(progress);
    }
    if (playbackItem?.UserData?.Played) {
        artwork.appendChild(buildWatchedIndicator());
    }
}

function buildMediaDetailWatchedState(): HTMLElement {
    const watched = document.createElement("div");
    watched.className = "media-detail-watched";
    watched.innerHTML = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="m3 7.2 2.5 2.5L11.2 4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Watched</span>';
    return watched;
}

function applyDetailPlaybackContext(element: HTMLElement, item: JellyfinBaseItem): void {
    const resumeTicks = item.UserData?.Played ? 0 : item.UserData?.PlaybackPositionTicks || 0;
    element.dataset.detailPlay = "";
    element.dataset.id = item.Id || "";
    element.dataset.name = String(item.Name || "Untitled");
    element.dataset.resume = String(resumeTicks);
    element.dataset.seriesId = item.SeriesId || "";
    element.dataset.seasonId = item.SeasonId || item.ParentId || "";
    element.dataset.episodeIndex = item.IndexNumber === undefined || item.IndexNumber === null
        ? ""
        : String(item.IndexNumber);
    element.setAttribute("data-clickable", "");
}

function buildSeriesEpisodesSection(
    seasons: JellyfinBaseItem[],
    selectedSeasonId: string,
    episodes: JellyfinBaseItem[],
    loadState: EpisodeLoadState
): HTMLElement {
    const section = document.createElement("section");
    section.className = "series-episodes";

    if (seasons.length > 0) {
        section.appendChild(buildSeasonSelector(seasons, selectedSeasonId));
    }
    const status = buildEpisodeLoadStatus(loadState);
    if (status) {
        section.appendChild(status);
        return section;
    }
    if (episodes.length === 0) {
        const empty = document.createElement("p");
        empty.className = "series-episode-empty";
        empty.textContent = "No episodes in this season.";
        section.appendChild(empty);
        return section;
    }

    const list = buildMediaList(episodes, {
        showSeriesName: false,
        showEpisodeNumber: true,
        useEpisodeThumbnail: true,
        episodeRow: true
    });
    list.classList.add("series-episode-list");
    section.appendChild(list);
    return section;
}

function buildSeasonSelector(seasons: JellyfinBaseItem[], selectedSeasonId: string): HTMLElement {
    const controls = document.createElement("div");
    controls.className = "series-episodes-controls";
    const selector = document.createElement("div");
    selector.className = "season-selector";
    selector.dataset.seasonSelector = "";
    const selectedSeason = seasons.find(season => season.Id === selectedSeasonId) || seasons[0];
    const trigger = document.createElement("button");
    trigger.className = "season-selector-trigger";
    trigger.type = "button";
    trigger.dataset.seasonMenuTrigger = "";
    trigger.setAttribute("data-clickable", "");
    trigger.setAttribute("aria-label", `Choose season, selected ${String(selectedSeason?.Name || "Season")}`);
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute("aria-controls", "season-selector-menu");
    const label = document.createElement("span");
    label.className = "season-selector-label";
    label.dataset.seasonMenuLabel = "";
    label.textContent = String(selectedSeason?.Name || "Season");
    trigger.append(label, buildDisclosureChevron());

    const menu = document.createElement("div");
    menu.id = "season-selector-menu";
    menu.className = "season-selector-menu hidden";
    menu.dataset.seasonMenu = "";
    menu.setAttribute("role", "listbox");
    menu.setAttribute("aria-label", "Season");
    seasons.forEach(season => {
        const option = document.createElement("button");
        option.className = "season-selector-option";
        option.type = "button";
        option.dataset.seasonOption = season.Id || "";
        option.setAttribute("data-clickable", "");
        option.setAttribute("role", "option");
        option.setAttribute("aria-selected", String(season.Id === selectedSeason?.Id));
        option.tabIndex = -1;
        option.textContent = String(season.Name || "Season");
        menu.appendChild(option);
    });
    selector.append(trigger, menu);
    controls.appendChild(selector);
    return controls;
}

function buildEpisodeLoadStatus(loadState: EpisodeLoadState): HTMLElement | null {
    if (loadState === "loading") {
        const status = document.createElement("div");
        status.className = "series-episode-status";
        status.setAttribute("role", "status");
        status.setAttribute("aria-label", "Loading episodes");
        status.appendChild(buildLibraryLoadingSpinner());
        return status;
    }
    if (loadState === "error") {
        const status = document.createElement("div");
        status.className = "series-episode-status series-episode-status--error";
        const message = document.createElement("p");
        message.textContent = "Couldn’t load episodes.";
        const retry = document.createElement("button");
        retry.className = "btn-secondary";
        retry.type = "button";
        retry.dataset.seasonRetry = "";
        retry.textContent = "Try Again";
        status.append(message, retry);
        return status;
    }
    return null;
}
