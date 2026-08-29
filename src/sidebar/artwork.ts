import type { JellyfinBaseItem } from "../jellyfin/types";

import type { ListCardOptions } from "./viewModels";

export type ArtworkImageType = "Primary" | "Thumb" | "Backdrop";

export interface ArtworkSource {
    itemId: string;
    imageType: ArtworkImageType;
    maxWidth: number;
}

export function selectCardArtwork(
    item: JellyfinBaseItem,
    options: ListCardOptions
): ArtworkSource {
    if (options.usePosterImage) {
        return source(getEpisodeSeriesId(item), "Primary", 420);
    }
    if (options.useEpisodeThumbnail && item.Type === "Episode" && item.Id) {
        return source(item.Id, "Primary");
    }
    return source(getEpisodeSeriesId(item), "Thumb");
}

export function selectCardFallbackArtwork(
    item: JellyfinBaseItem,
    options: ListCardOptions
): ArtworkSource | null {
    if (options.usePosterImage) {
        return item.Type === "Episode" && item.Id
            ? source(item.Id, "Primary", 420)
            : source(item.Id || "", "Backdrop");
    }
    if (hasEpisodeThumbnailFallback(item, options)) {
        return source(item.SeriesId || "", "Thumb");
    }
    if (options.useSeriesBackdropFallback && item.Type === "Episode" && item.SeriesId) {
        return source(item.SeriesId, "Backdrop");
    }
    if (item.Type === "Movie" || item.Type === "Series") {
        return source(item.Id || "", "Backdrop");
    }
    return null;
}

export function getDetailPlaybackLabel(
    item: JellyfinBaseItem,
    playbackItem: JellyfinBaseItem | null,
    preferredLabel: string
): string {
    if (!playbackItem) {
        return "";
    }
    if (preferredLabel) {
        return `${preferredLabel}, ${String(item.Name || "series")}`;
    }
    const hasResumePosition = playbackItem.UserData?.PlaybackPositionTicks
        && !playbackItem.UserData.Played;
    const action = hasResumePosition ? "Resume" : "Play";
    return `${action} ${String(item.Name || "movie")}`;
}

function getEpisodeSeriesId(item: JellyfinBaseItem): string {
    return item.Type === "Episode" && item.SeriesId ? item.SeriesId : item.Id || "";
}

function hasEpisodeThumbnailFallback(
    item: JellyfinBaseItem,
    options: ListCardOptions
): boolean {
    return Boolean(
        options.useEpisodeThumbnail
        && item.Type === "Episode"
        && item.SeriesId
        && !options.disableEpisodeThumbnailFallback
    );
}

function source(
    itemId: string,
    imageType: ArtworkImageType,
    maxWidth: number = 680
): ArtworkSource {
    return { itemId, imageType, maxWidth };
}
