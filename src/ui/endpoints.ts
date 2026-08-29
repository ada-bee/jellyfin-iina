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
    collectionType: string,
    startIndex: number = 0,
    limit: number = 60
): string {
    const itemType = collectionType === "movies" ? "Movie" : "Series";
    let endpoint = `/Items?userId=${encodeURIComponent(userId)}`;
    endpoint += libraryId
        ? `&parentId=${encodeURIComponent(libraryId)}`
        : "&recursive=true";
    endpoint += "&sortBy=SortName&sortOrder=Ascending";
    endpoint += `&fields=${FIELDS_LIBRARY_ITEMS}`;
    endpoint += "&enableImageTypes=Primary,Backdrop,Thumb";
    endpoint += `&includeItemTypes=${itemType}`;
    endpoint += `&startIndex=${startIndex}&limit=${limit}`;
    return endpoint;
}

export function buildEpisodesEndpoint(userId: string, seriesId: string, seasonId: string): string {
    return `/Shows/${encodeURIComponent(seriesId)}/Episodes?userId=${encodeURIComponent(userId)}` +
        `&seasonId=${encodeURIComponent(seasonId)}&fields=${FIELDS_EPISODES}`;
}

export function buildLatestItemsEndpoint(userId: string, itemType: string, limit: number): string {
    return `/Items/Latest?userId=${encodeURIComponent(userId)}` +
        `&includeItemTypes=${encodeURIComponent(itemType)}&limit=${limit}` +
        `&fields=${FIELDS_HOME_ITEMS}&groupItems=false`;
}

export function buildItemsByIdsEndpoint(userId: string, itemIds: string[], itemType: string): string {
    const ids = itemIds.map(itemId => encodeURIComponent(itemId)).join(",");
    return `/Items?userId=${encodeURIComponent(userId)}&ids=${ids}` +
        `&includeItemTypes=${encodeURIComponent(itemType)}` +
        `&fields=${FIELDS_HOME_ITEMS}&enableImageTypes=Primary,Backdrop,Thumb`;
}

export function buildNewestSeasonsEndpoint(userId: string, startIndex: number, limit: number): string {
    return `/Items?userId=${encodeURIComponent(userId)}&recursive=true&includeItemTypes=Season` +
        `&sortBy=DateCreated&sortOrder=Descending&startIndex=${startIndex}&limit=${limit}` +
        "&fields=SeriesId,ParentId";
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
        "&recursive=true&limit=20";
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
