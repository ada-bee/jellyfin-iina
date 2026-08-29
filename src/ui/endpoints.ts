import {
    FIELDS_EPISODES,
    FIELDS_HOME_ITEMS,
    FIELDS_LIBRARY_ITEMS,
    FIELDS_SEARCH,
    FIELDS_SEASONS
} from "./constants";

export function buildLibraryItemsEndpoint(
    userId: string,
    libraryId: string,
    collectionType: string
): string {
    const itemType = collectionType === "movies" ? "Movie" : "Series";
    let endpoint = `/Items?userId=${encodeURIComponent(userId)}`;
    endpoint += `&parentId=${encodeURIComponent(libraryId)}`;
    endpoint += "&sortBy=SortName&sortOrder=Ascending";
    endpoint += `&fields=${FIELDS_LIBRARY_ITEMS}`;
    endpoint += "&enableImageTypes=Primary,Backdrop,Thumb";
    endpoint += `&includeItemTypes=${itemType}`;
    return endpoint;
}

export function buildEpisodesEndpoint(userId: string, seriesId: string, seasonId: string): string {
    return `/Shows/${encodeURIComponent(seriesId)}/Episodes?userId=${encodeURIComponent(userId)}` +
        `&seasonId=${encodeURIComponent(seasonId)}&fields=${FIELDS_EPISODES}`;
}

export function buildLatestItemsEndpoint(userId: string, itemType: string, limit: number): string {
    return `/Items/Latest?userId=${encodeURIComponent(userId)}` +
        `&includeItemTypes=${encodeURIComponent(itemType)}&limit=${limit}` +
        `&fields=${FIELDS_HOME_ITEMS}`;
}

export function buildResumeItemsEndpoint(userId: string): string {
    return `/UserItems/Resume?userId=${encodeURIComponent(userId)}&limit=10&mediaTypes=Video` +
        `&fields=${FIELDS_HOME_ITEMS}`;
}

export function buildNextUpItemsEndpoint(userId: string): string {
    return `/Shows/NextUp?userId=${encodeURIComponent(userId)}&limit=10&fields=${FIELDS_HOME_ITEMS}`;
}

export function buildSearchEndpoint(userId: string, query: string): string {
    return `/Items?searchTerm=${encodeURIComponent(query)}` +
        `&userId=${encodeURIComponent(userId)}` +
        "&includeItemTypes=Movie,Series,Episode" +
        `&fields=${FIELDS_SEARCH}` +
        "&recursive=true&limit=20&sortBy=SortName&sortOrder=Ascending";
}

export function buildSeasonsEndpoint(userId: string, seriesId: string): string {
    return `/Shows/${encodeURIComponent(seriesId)}/Seasons?userId=${encodeURIComponent(userId)}` +
        `&fields=${FIELDS_SEASONS}`;
}

export function buildSeriesNextUpEndpoint(userId: string, seriesId: string): string {
    return `/Shows/NextUp?userId=${encodeURIComponent(userId)}` +
        `&seriesId=${encodeURIComponent(seriesId)}&limit=1&fields=${FIELDS_HOME_ITEMS}`;
}

export function buildItemDetailsEndpoint(
    userId: string,
    itemId: string,
    fields: string
): string {
    return `/Items/${encodeURIComponent(itemId)}?userId=${encodeURIComponent(userId)}` +
        `&fields=${fields}`;
}
