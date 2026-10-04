import type { JellyfinBaseItem } from "../../jellyfin/types";
import {
    buildMediaDetailsViewModel,
    buildSeriesNextUpViewModel,
    getProgressPercent,
    getPlayActionLabel,
    type EpisodeLoadState,
    type MediaFileMetadataGroup,
    type MediaFileMetadataSource,
    type MediaFileMetadataTrack,
    type MediaFileTrackKind,
    type MediaDetailsViewModel
} from "../viewModels";
import { setBackdropDetail } from "../backdropContext";
import { ui } from "../dom";
import {
    buildMediaList,
    buildPlayButton,
    buildThumbProgressElement,
    buildWatchedIndicator,
    getImageUrl
} from "./cards";
import { buildLibraryLoadingSpinner, replaceContent } from "./content";
import { buildDisclosureChevron } from "./elements";
import { getDetailPlaybackLabel } from "../artwork";

export function renderMovieDetails(item: JellyfinBaseItem): void {
    renderPlayableDetails(item, "movie-details");
}

export function renderEpisodeDetails(item: JellyfinBaseItem): void {
    renderPlayableDetails(item, "episode-details");
}

function renderPlayableDetails(item: JellyfinBaseItem, className: string): void {
    const viewModel = buildMediaDetailsViewModel(item);
    const details = buildMediaDetails(
        item,
        viewModel,
        item,
        "",
        false
    );
    details.classList.add("playable-details", className);
    if (viewModel.mediaFileSources.length > 0) {
        details.appendChild(buildMediaFileInfo(viewModel.mediaFileSources));
    }
    replaceContent(details);
    renderPlayableDetailActions(item);
    setBackdropDetail(item);
}

export function renderSeriesDetails(
    item: JellyfinBaseItem,
    seasons: JellyfinBaseItem[],
    expandedSeasonId: string,
    episodes: JellyfinBaseItem[],
    playbackItem: JellyfinBaseItem | null,
    episodeLoadState: EpisodeLoadState
): void {
    const details = buildMediaDetails(
        item,
        buildMediaDetailsViewModel(item, seasons.length),
        null,
        "",
        false
    );
    details.classList.add("series-details");
    if (playbackItem) {
        details.querySelector(".media-detail-info")?.appendChild(buildSeriesNextUp(playbackItem));
    }
    details.appendChild(buildSeriesSeasonsSection(seasons, expandedSeasonId, episodes, episodeLoadState));
    replaceContent(details);
    if (playbackItem) {
        renderPlayableDetailActions(playbackItem);
    }
    setBackdropDetail(item);
}

export function renderSeriesSeasons(
    seasons: JellyfinBaseItem[],
    expandedSeasonId: string,
    episodes: JellyfinBaseItem[],
    episodeLoadState: EpisodeLoadState
): boolean {
    const currentSection = ui.content.querySelector<HTMLElement>(".series-seasons");
    if (!currentSection) {
        return false;
    }
    const focusedSeasonId = currentSection.contains(document.activeElement)
        ? document.activeElement?.closest<HTMLElement>(".series-season")?.dataset.seasonId
        : undefined;
    const nextSection = buildSeriesSeasonsSection(
        seasons,
        expandedSeasonId,
        episodes,
        episodeLoadState
    );
    currentSection.replaceWith(nextSection);
    if (focusedSeasonId !== undefined) {
        [...nextSection.querySelectorAll<HTMLButtonElement>("[data-season-toggle]")]
            .find(button => button.dataset.seasonToggle === focusedSeasonId)
            ?.focus({ preventScroll: true });
    }
    return true;
}

function buildMediaDetails(
    item: JellyfinBaseItem,
    viewModel: MediaDetailsViewModel,
    playbackItem: JellyfinBaseItem | null,
    playbackLabel: string = "",
    artworkClickable: boolean = true
): HTMLElement {
    const details = document.createElement("article");
    details.className = "media-details";
    details.appendChild(buildMediaDetailArtwork(
        item,
        playbackItem,
        playbackLabel,
        artworkClickable
    ));
    details.appendChild(buildMediaDetailInfo(viewModel));
    return details;
}

function renderPlayableDetailActions(item: JellyfinBaseItem): void {
    const play = document.createElement("button");
    play.className = "media-detail-action media-detail-action--primary";
    play.type = "button";
    applyDetailPlaybackContext(play, item);
    const playLabel = getPlayActionLabel(item);
    const targetLabel = String(item.Name || "video");
    play.setAttribute("aria-label", `${playLabel} ${targetLabel}`);
    play.innerHTML = '<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M4.5 2.8c0-.6.7-.9 1.2-.6l6 4c.4.3.4.9 0 1.2l-6 4c-.5.3-1.2 0-1.2-.6v-8Z" fill="currentColor"/></svg>';
    play.appendChild(buildDetailActionLabel(playLabel));

    const queue = document.createElement("button");
    queue.className = "media-detail-action media-detail-action--secondary";
    queue.type = "button";
    applyDetailQueueContext(queue, item);
    queue.setAttribute("aria-label", `Queue ${targetLabel}`);
    queue.innerHTML = '<svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true"><path d="M2.2 4h7.2M2.2 7.5h7.2M2.2 11h4.6M11.7 8.8v4.4M9.5 11h4.4" stroke="currentColor" stroke-width="1.35" stroke-linecap="round"/></svg>';
    queue.appendChild(buildDetailActionLabel("Queue"));

    ui.bottomDetailActions.replaceChildren(play, queue);
    ui.bottomDetailActions.classList.remove("hidden");
}

function buildDetailActionLabel(label: string): HTMLElement {
    const element = document.createElement("span");
    element.textContent = label;
    return element;
}

function buildSeriesNextUp(item: JellyfinBaseItem): HTMLElement {
    const viewModel = buildSeriesNextUpViewModel(item);
    const nextUp = document.createElement("div");
    nextUp.className = "series-next-up";

    const label = document.createElement("p");
    label.className = "series-next-up-label";
    label.textContent = "Next up:";

    const target = document.createElement("div");
    target.className = "series-next-up-target";
    target.dataset.seriesNextUp = item.Id || "";
    target.dataset.name = viewModel.title;

    const detailsButton = document.createElement("button");
    detailsButton.className = "series-next-up-details";
    detailsButton.type = "button";
    detailsButton.setAttribute("data-clickable", "");
    detailsButton.setAttribute("aria-label", [
        "View episode details:",
        viewModel.episodeNumber,
        viewModel.title,
        viewModel.duration
    ].filter(Boolean).join(" "));

    const artwork = document.createElement("div");
    artwork.className = "series-next-up-artwork";
    const image = document.createElement("img");
    image.className = "series-next-up-image list-thumb";
    image.src = getImageUrl(item.Id || "", "Primary", 240);
    image.dataset.fallback = getImageUrl(item.SeriesId || "", "Thumb", 240);
    image.dataset.itemId = item.SeriesId || "";
    image.dataset.type = "Series";
    image.alt = "";
    const playButton = buildPlayButton(`${getPlayActionLabel(item)} ${viewModel.title}`);
    applyDetailPlaybackContext(playButton, item);
    artwork.append(image, playButton);

    const copy = document.createElement("span");
    copy.className = "series-next-up-copy";
    const title = document.createElement("span");
    title.className = "series-next-up-title";
    title.textContent = viewModel.title;
    const metadata = document.createElement("span");
    metadata.className = "series-next-up-metadata";
    metadata.textContent = [viewModel.episodeNumber, viewModel.duration].filter(Boolean).join(" · ");
    copy.append(title, metadata);
    target.append(detailsButton, artwork, copy);
    nextUp.append(label, target);
    return nextUp;
}

function buildMediaFileInfo(sources: MediaFileMetadataSource[]): HTMLElement {
    const section = document.createElement("section");
    section.className = "media-file-info";
    section.setAttribute("aria-label", "Media file");
    const list = document.createElement("dl");
    list.className = "media-file-metadata";
    section.appendChild(list);
    const selectedSource = sources.find(source => source.groups.some(group => (
        group.kind === "video" && group.tracks.some(track => track.selected)
    ))) || sources[0];
    renderMediaFileSource(section, list, sources, selectedSource, false);
    return section;
}

function renderMediaFileSource(
    section: HTMLElement,
    list: HTMLDListElement,
    sources: MediaFileMetadataSource[],
    selectedSource: MediaFileMetadataSource,
    restoreFocus: boolean
): void {
    section.dataset.mediaSourceId = selectedSource.mediaSourceId;
    const selectSource = (mediaSourceId: string) => {
        const source = sources.find(candidate => candidate.mediaSourceId === mediaSourceId);
        if (source) {
            renderMediaFileSource(section, list, sources, source, true);
        }
    };
    list.replaceChildren(...getMediaFileGroups(sources, selectedSource)
        .map(group => buildMediaFileGroup(group, selectSource)));
    if (restoreFocus) {
        list.querySelector<HTMLButtonElement>(
            '[data-media-track="video"][aria-pressed="true"]'
        )?.focus();
    }
}

function getMediaFileGroups(
    sources: MediaFileMetadataSource[],
    selectedSource: MediaFileMetadataSource
): MediaFileMetadataGroup[] {
    const videoTracks = sources.flatMap(source => (
        source.groups.find(group => group.kind === "video")?.tracks.map(track => ({
            ...track,
            selected: source === selectedSource
        })) || []
    ));
    return [
        { kind: "video", label: "Video", tracks: videoTracks },
        ...selectedSource.groups.filter(group => group.kind !== "video")
    ];
}

function buildMediaFileGroup(
    group: MediaFileMetadataGroup,
    selectSource: (mediaSourceId: string) => void
): HTMLElement {
    const row = document.createElement("div");
    row.className = "media-file-group";
    const label = document.createElement("dt");
    label.textContent = `${group.label}:`;
    const tracks = document.createElement("dd");
    group.tracks.forEach(track => tracks.appendChild(
        buildMediaFileTrack(group.kind, track, selectSource)
    ));
    row.append(label, tracks);
    return row;
}

function buildMediaFileTrack(
    kind: MediaFileTrackKind,
    track: MediaFileMetadataTrack,
    selectSource: (mediaSourceId: string) => void
): HTMLElement {
    const element = document.createElement(track.selectable ? "button" : "div");
    element.className = "media-file-track";
    if (element instanceof HTMLButtonElement) {
        element.type = "button";
        element.dataset.mediaTrack = kind;
        if (track.streamIndex !== null) {
            element.dataset.streamIndex = String(track.streamIndex);
        }
        if (track.mediaSourceId) {
            element.dataset.mediaSourceId = track.mediaSourceId;
        }
        element.setAttribute("aria-pressed", String(track.selected));
        element.setAttribute("data-clickable", "");
        element.addEventListener("click", () => {
            if (kind === "video" && track.mediaSourceId) {
                selectSource(track.mediaSourceId);
                return;
            }
            selectMediaFileTrack(element, kind);
        });
    }
    const title = document.createElement("span");
    title.className = "media-file-track-title";
    title.textContent = track.title;
    element.appendChild(title);
    if (track.technical) {
        const technical = document.createElement("span");
        technical.className = "media-file-track-technical";
        technical.textContent = ` · ${track.technical}`;
        element.appendChild(technical);
    }
    return element;
}

function selectMediaFileTrack(
    selected: HTMLButtonElement,
    kind: MediaFileTrackKind
): void {
    const deselect = kind === "subtitle" && selected.getAttribute("aria-pressed") === "true";
    selected.closest("dd")?.querySelectorAll<HTMLButtonElement>("[data-media-track]")
        .forEach(track => track.setAttribute("aria-pressed", "false"));
    if (!deselect) {
        selected.setAttribute("aria-pressed", "true");
    }
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
    playbackLabel: string,
    clickable: boolean
): HTMLElement {
    const artwork = buildMediaDetailArtworkContainer(item, playbackItem, playbackLabel, clickable);
    artwork.appendChild(buildMediaDetailImage(item));
    appendMediaDetailPlaybackState(artwork, playbackItem);
    return artwork;
}

function buildMediaDetailArtworkContainer(
    item: JellyfinBaseItem,
    playbackItem: JellyfinBaseItem | null,
    playbackLabel: string,
    clickable: boolean
): HTMLElement {
    if (!playbackItem || !clickable) {
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
    const isEpisode = item.Type === "Episode";
    const fallbackItemId = isEpisode && item.SeriesId ? item.SeriesId : item.Id || "";
    image.src = getImageUrl(item.Id || "", isEpisode ? "Primary" : "Thumb", 1000);
    image.dataset.fallback = getImageUrl(fallbackItemId, isEpisode ? "Thumb" : "Backdrop", 1000);
    image.dataset.itemId = fallbackItemId;
    image.dataset.type = isEpisode && item.SeriesId ? "Series" : item.Type || "";
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

function applyDetailPlaybackContext(element: HTMLElement, item: JellyfinBaseItem): void {
    element.dataset.detailPlay = "";
    applyDetailActionContext(element, item);
}

function applyDetailQueueContext(element: HTMLElement, item: JellyfinBaseItem): void {
    element.dataset.detailQueue = "";
    applyDetailActionContext(element, item);
}

function applyDetailActionContext(element: HTMLElement, item: JellyfinBaseItem): void {
    const resumeTicks = item.UserData?.Played ? 0 : item.UserData?.PlaybackPositionTicks || 0;
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

function buildSeriesSeasonsSection(
    seasons: JellyfinBaseItem[],
    expandedSeasonId: string,
    episodes: JellyfinBaseItem[],
    loadState: EpisodeLoadState
): HTMLElement {
    const section = document.createElement("section");
    section.className = "series-seasons";
    section.setAttribute("aria-label", "Seasons");
    if (seasons.length === 0) {
        const empty = document.createElement("p");
        empty.className = "series-season-empty";
        empty.textContent = "No seasons available.";
        section.appendChild(empty);
        return section;
    }

    const list = document.createElement("div");
    list.className = "series-season-list";
    seasons.forEach((season, index) => {
        const expanded = season.Id === expandedSeasonId;
        list.appendChild(buildSeason(
            season,
            index,
            expanded,
            expanded ? episodes : [],
            expanded ? loadState : "ready"
        ));
    });
    section.appendChild(list);
    return section;
}

function buildSeason(
    season: JellyfinBaseItem,
    index: number,
    expanded: boolean,
    episodes: JellyfinBaseItem[],
    loadState: EpisodeLoadState
): HTMLElement {
    const item = document.createElement("section");
    item.className = "series-season";
    item.dataset.seasonId = season.Id || "";

    const heading = document.createElement("h3");
    heading.className = "series-season-heading";
    const trigger = document.createElement("button");
    trigger.className = "series-season-trigger";
    trigger.type = "button";
    trigger.dataset.seasonToggle = season.Id || "";
    trigger.setAttribute("data-clickable", "");
    trigger.setAttribute("aria-expanded", String(expanded));
    trigger.setAttribute("aria-controls", `series-season-panel-${index}`);
    const label = document.createElement("span");
    label.className = "series-season-label";
    label.textContent = String(season.Name || "Season");
    trigger.append(label, buildDisclosureChevron());
    heading.appendChild(trigger);

    const panel = document.createElement("div");
    panel.id = `series-season-panel-${index}`;
    panel.className = "series-season-panel";
    panel.hidden = !expanded;
    if (expanded) {
        appendSeasonEpisodes(panel, episodes, loadState);
    }
    item.append(heading, panel);
    return item;
}

function appendSeasonEpisodes(
    panel: HTMLElement,
    episodes: JellyfinBaseItem[],
    loadState: EpisodeLoadState
): void {
    const status = buildEpisodeLoadStatus(loadState);
    if (status) {
        panel.appendChild(status);
        return;
    }
    if (episodes.length === 0) {
        const empty = document.createElement("p");
        empty.className = "series-episode-empty";
        empty.textContent = "No episodes in this season.";
        panel.appendChild(empty);
        return;
    }
    const list = buildMediaList(episodes, {
        showSeriesName: false,
        showEpisodeNumber: true,
        useEpisodeThumbnail: true,
        episodeRow: true
    });
    list.classList.add("series-episode-list");
    panel.appendChild(list);
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
