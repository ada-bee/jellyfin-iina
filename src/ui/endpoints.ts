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
    startIndex: number,
    limit: number
): string {
    const itemType = collectionType === "movies" ? "Movie" : "Series";
    const scope = libraryId ? `ParentId=${encodeURIComponent(libraryId)}` : "Recursive=true";
    let endpoint = `/Users/${userId}/Items?${scope}`;
    endpoint += "&SortBy=SortName&SortOrder=Ascending";
    endpoint += `&Fields=${FIELDS_LIBRARY_ITEMS}`;
    endpoint += "&EnableImageTypes=Primary,Backdrop,Thumb";
    endpoint += `&IncludeItemTypes=${itemType}`;
    endpoint += `&StartIndex=${startIndex}&Limit=${limit}`;
    return endpoint;
}

export function buildEpisodesEndpoint(userId: string, seriesId: string, seasonId: string): string {
    return `/Shows/${seriesId}/Episodes?UserId=${userId}&SeasonId=${seasonId}` +
        `&Fields=${FIELDS_EPISODES}`;
}

export function buildLatestItemsEndpoint(userId: string, itemType: string, limit: number): string {
    return `/Users/${userId}/Items/Latest?IncludeItemTypes=${itemType}&Limit=${limit}` +
        `&Fields=${FIELDS_HOME_ITEMS}&GroupItems=false`;
}

export function buildItemsByIdsEndpoint(userId: string, itemIds: string[], itemType: string): string {
    const ids = itemIds.map(itemId => encodeURIComponent(itemId)).join(",");
    return `/Users/${userId}/Items?Ids=${ids}&IncludeItemTypes=${itemType}` +
        `&Fields=${FIELDS_HOME_ITEMS}&EnableImageTypes=Primary,Backdrop,Thumb`;
}

export function buildNewestSeasonsEndpoint(userId: string, startIndex: number, limit: number): string {
    return `/Users/${userId}/Items?Recursive=true&IncludeItemTypes=Season` +
        `&SortBy=DateCreated&SortOrder=Descending&StartIndex=${startIndex}&Limit=${limit}` +
        "&Fields=SeriesId,ParentId";
}

export function buildResumeItemsEndpoint(userId: string): string {
    return `/Users/${userId}/Items/Resume?Limit=10&MediaTypes=Video` +
        `&Fields=${FIELDS_HOME_ITEMS}`;
}

export function buildNextUpItemsEndpoint(userId: string): string {
    return `/Shows/NextUp?UserId=${userId}&Limit=10&Fields=${FIELDS_HOME_ITEMS}`;
}

export function buildSearchEndpoint(userId: string, query: string): string {
    return `/Items?SearchTerm=${encodeURIComponent(query)}` +
        `&UserId=${userId}` +
        "&IncludeItemTypes=Movie,Series,Episode" +
        `&Fields=${FIELDS_SEARCH}` +
        "&Recursive=true&Limit=20";
}

export function buildSeasonsEndpoint(userId: string, seriesId: string): string {
    return `/Shows/${seriesId}/Seasons?UserId=${userId}&Fields=${FIELDS_SEASONS}`;
}

export function buildSeriesNextUpEndpoint(userId: string, seriesId: string): string {
    return `/Shows/NextUp?UserId=${userId}&SeriesId=${seriesId}&Limit=1&Fields=${FIELDS_HOME_ITEMS}`;
}
