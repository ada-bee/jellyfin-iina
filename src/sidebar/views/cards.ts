import type { JellyfinBaseItem } from "../../jellyfin/types";
import {
    buildMediaCardViewModel,
    getPlayActionLabel,
    type CardContext,
    type ListCardOptions,
    type MediaCardViewModel
} from "../viewModels";
import { buildJellyfinImageUrl } from "../../jellyfin/images";
import { state } from "../store";
import {
    selectCardArtwork,
    selectCardFallbackArtwork,
    type ArtworkSource
} from "../artwork";

export function buildMediaList(items: JellyfinBaseItem[], options: ListCardOptions): HTMLElement {
    const list = document.createElement("div");
    list.className = "media-list";
    items.forEach(item => list.appendChild(buildListCardElement(item, options)));
    return list;
}

export function buildListCardElement(item: JellyfinBaseItem, options: ListCardOptions): HTMLElement {
    const viewModel = buildMediaCardViewModel(item, options);
    const card = document.createElement("div");
    card.className = "list-card";
    card.classList.toggle("home-poster-card", Boolean(options.homePoster));
    card.classList.toggle("home-thumbnail-card", Boolean(options.homeThumbnail));
    card.classList.toggle("library-poster-card", Boolean(options.libraryPoster));
    card.classList.toggle("series-episode-card", Boolean(options.episodeRow));
    applyCardContext(card, viewModel.context);
    card.appendChild(buildCardDetailsButton(viewModel));

    const thumbWrapper = document.createElement("div");
    thumbWrapper.className = "thumb-wrapper";
    thumbWrapper.appendChild(buildCardImage(item, options));
    const playButton = buildPlayButton(
        `${getPlayActionLabel(item)} ${viewModel.context.name}`
    );
    playButton.dataset.cardPlay = "";
    thumbWrapper.appendChild(playButton);
    if (viewModel.remainingLabel && !viewModel.artworkOnly) {
        const label = document.createElement("div");
        label.className = "resume-label";
        label.textContent = viewModel.remainingLabel;
        thumbWrapper.appendChild(label);
    }
    const progress = buildThumbProgressElement(viewModel.progressPercent);
    if (progress) {
        thumbWrapper.appendChild(progress);
    }
    if (viewModel.played) {
        thumbWrapper.appendChild(buildWatchedIndicator());
    }

    card.title = viewModel.accessibleName;
    card.appendChild(thumbWrapper);
    if (!viewModel.artworkOnly) {
        card.appendChild(buildCardBody(viewModel, options));
    }
    return card;
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
    if (
        imageElement.classList.contains("list-thumb") ||
        imageElement.classList.contains("media-detail-image")
    ) {
        handleImageFallback(imageElement);
    }
}

export function buildThumbProgressElement(percent: number | null): HTMLElement | null {
    if (percent === null) {
        return null;
    }
    const roundedPercent = Math.round(percent);
    const progress = document.createElement("div");
    progress.className = "thumb-progress";
    progress.setAttribute("role", "progressbar");
    progress.setAttribute("aria-valuenow", String(roundedPercent));
    progress.setAttribute("aria-valuemin", "0");
    progress.setAttribute("aria-valuemax", "100");
    progress.setAttribute("aria-valuetext", `${roundedPercent}% watched`);

    const fill = document.createElement("div");
    fill.className = "thumb-progress-fill";
    fill.style.width = `${percent}%`;
    progress.appendChild(fill);
    return progress;
}

export function buildWatchedIndicator(): HTMLElement {
    const indicator = document.createElement("div");
    indicator.className = "watched-indicator";
    indicator.setAttribute("title", "Watched");
    indicator.innerHTML = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="m3 7.2 2.5 2.5L11.2 4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    return indicator;
}

export function buildPlayButton(accessibleLabel: string): HTMLButtonElement {
    const button = document.createElement("button");
    button.className = "play-button";
    button.type = "button";
    button.setAttribute("data-clickable", "");
    button.setAttribute("aria-label", accessibleLabel);
    button.title = accessibleLabel;
    button.innerHTML = '<svg width="23" height="23" viewBox="0 0 23 23" aria-hidden="true"><path d="M7.8 4.9c0-.8.9-1.3 1.6-.8l8.4 5.5c.7.4.7 1.4 0 1.8l-8.4 5.5c-.7.5-1.6 0-1.6-.8V4.9Z" fill="currentColor"/></svg>';
    return button;
}

export function getImageUrl(
    itemId: string,
    imageType: string = "Primary",
    maxWidth: number = 680
): string {
    return buildJellyfinImageUrl({
        serverUrl: state.serverUrl,
        accessToken: state.accessToken,
        itemId,
        imageType,
        maxWidth
    });
}

export function getNextUpImageOptions(): ListCardOptions {
    return state.preferEpisodeImagesInNextUp
        ? { useEpisodeThumbnail: true, disableEpisodeThumbnailFallback: true }
        : { useEpisodeThumbnail: false, useSeriesBackdropFallback: true };
}

export function getLibraryPosterOptions(): ListCardOptions {
    return {
        libraryPoster: true,
        usePosterImage: true,
        showSeriesName: false
    };
}

export function getSearchCardOptions(item: JellyfinBaseItem): ListCardOptions {
    if (item.Type === "Episode") {
        return {
            homeThumbnail: true,
            showSeriesName: true,
            showEpisodeNumber: true,
            useEpisodeThumbnail: true
        };
    }
    if (item.Type === "Movie" || item.Type === "Series") {
        return getLibraryPosterOptions();
    }
    return { showSeriesName: false };
}

function buildCardImage(item: JellyfinBaseItem, options: ListCardOptions): HTMLImageElement {
    const image = document.createElement("img");
    image.className = "list-thumb";
    image.src = getArtworkUrl(selectCardArtwork(item, options));
    image.dataset.fallback = getArtworkUrl(selectCardFallbackArtwork(item, options));
    image.dataset.itemId = item.Id || "";
    image.dataset.type = item.Type || "";
    image.alt = "";
    image.loading = "lazy";
    return image;
}

function buildCardBody(viewModel: MediaCardViewModel, options: ListCardOptions): HTMLElement {
    const body = document.createElement("div");
    body.className = "list-body";

    const title = document.createElement("div");
    title.className = "list-title";
    title.textContent = viewModel.title;
    if (options.episodeRow) {
        const heading = document.createElement("div");
        heading.className = "series-episode-heading";
        if (viewModel.episodeNumber) {
            const number = document.createElement("span");
            number.className = "series-episode-number";
            number.textContent = viewModel.episodeNumber;
            heading.appendChild(number);
        }
        heading.appendChild(title);
        if (viewModel.episodeRuntime) {
            const duration = document.createElement("span");
            duration.className = "series-episode-duration";
            duration.textContent = viewModel.episodeRuntime;
            heading.appendChild(duration);
        }
        body.appendChild(heading);
    } else {
        body.appendChild(title);
    }

    if (viewModel.metadata && !options.episodeRow) {
        const metadata = document.createElement("div");
        metadata.className = "list-meta";
        metadata.textContent = viewModel.metadata;
        body.appendChild(metadata);
    }
    if (options.episodeRow && viewModel.overview) {
        const overview = document.createElement("div");
        overview.className = "list-overview";
        overview.textContent = viewModel.overview;
        body.appendChild(overview);
    }
    return body;
}

function buildCardDetailsButton(viewModel: MediaCardViewModel): HTMLButtonElement {
    const button = document.createElement("button");
    button.className = "card-details-button";
    button.type = "button";
    button.dataset.cardDetails = "";
    button.setAttribute("data-clickable", "");
    button.setAttribute("aria-label", `View details: ${viewModel.accessibleName}`);
    return button;
}

function applyCardContext(card: HTMLElement, context: CardContext): void {
    card.dataset.id = context.id;
    card.dataset.name = context.name;
    card.dataset.type = context.type;
    card.dataset.resume = String(context.resume);
    card.dataset.seriesId = context.context.seriesId;
    card.dataset.seasonId = context.context.seasonId;
    card.dataset.episodeIndex = context.context.episodeIndex === null
        ? ""
        : String(context.context.episodeIndex);
}

function getArtworkUrl(artwork: ArtworkSource | null): string {
    return artwork
        ? getImageUrl(artwork.itemId, artwork.imageType, artwork.maxWidth)
        : "";
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
