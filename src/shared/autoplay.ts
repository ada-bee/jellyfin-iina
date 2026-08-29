import type { JellyfinBaseItem } from "./jellyfin";

function hasIndex(item: JellyfinBaseItem): item is JellyfinBaseItem & { IndexNumber: number } {
    return typeof item.IndexNumber === "number" && Number.isFinite(item.IndexNumber);
}

function sortByIndex(items: JellyfinBaseItem[]): JellyfinBaseItem[] {
    return [...items].sort((a, b) => {
        if (!hasIndex(a)) {
            return hasIndex(b) ? 1 : 0;
        }
        if (!hasIndex(b)) {
            return -1;
        }
        return a.IndexNumber - b.IndexNumber;
    });
}

export function findNextEpisodeInSeason(
    episodes: JellyfinBaseItem[],
    currentEpisodeIndex: number
): JellyfinBaseItem | null {
    return sortByIndex(episodes)
        .find((episode) => hasIndex(episode) && episode.IndexNumber > currentEpisodeIndex)
        || null;
}

export function findFirstEpisodeInSeason(episodes: JellyfinBaseItem[]): JellyfinBaseItem | null {
    return sortByIndex(episodes)[0] || null;
}

export function getFollowingSeasons(
    seasons: JellyfinBaseItem[],
    currentSeasonId: string
): JellyfinBaseItem[] {
    const sortedSeasons = sortByIndex(seasons);
    const currentIndex = sortedSeasons.findIndex((season) => season.Id === currentSeasonId);
    return currentIndex === -1 ? [] : sortedSeasons.slice(currentIndex + 1);
}
