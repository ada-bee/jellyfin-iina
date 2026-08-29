import type { PlaybackSession } from "../../playback/ports";
import type {
    JellyfinBaseItem,
    JellyfinBaseItemQuery,
    JellyfinPlaybackInfoResponse
} from "../../jellyfin/types";

import {
    findFirstEpisodeInSeason,
    findNextEpisodeInSeason,
    getFollowingSeasons
} from "../../playback/episodeOrder";
import { IINA_DEVICE_PROFILE } from "../../jellyfin/deviceProfile";
import {
    buildJellyfinWindowTitle,
    buildPlaybackHandoff,
    buildPlaybackInfoRequest
} from "../../playback/negotiation";
import { FIELDS_EPISODES, FIELDS_SEASONS, ITEM_DETAILS_FIELDS } from "../../jellyfin/fields";
import type { HttpContext, HttpRequestOptions } from "./apiClient";

interface AutoplayRequestPort {
    requestJson<T>(context: HttpContext, options: HttpRequestOptions): Promise<T | null>;
}

interface EpisodeLocation {
    seriesId: string;
    seasonId: string;
    episodeIndex: number;
}

export function createAutoplayResolver(port: AutoplayRequestPort) {
    return async function resolveAutoplayNextEpisode(playback: PlaybackSession) {
        if (!hasPlaybackContext(playback)) {
            return null;
        }

        const itemDetails = await fetchItemDetails(port, playback, playback.itemId);
        if (!itemDetails || itemDetails.Type !== "Episode") {
            return null;
        }
        const location = resolveEpisodeLocation(playback, itemDetails);
        if (!location) {
            return null;
        }

        const nextEpisode = await resolveSequentialNextEpisode(port, playback, location);
        if (!nextEpisode?.Id || nextEpisode.Id === playback.itemId) {
            return null;
        }

        return buildAutoplayStream(port, playback, nextEpisode.Id, {
            seriesId: nextEpisode.SeriesId || location.seriesId,
            seasonId: nextEpisode.SeasonId || nextEpisode.ParentId || location.seasonId,
            episodeIndex: nextEpisode.IndexNumber ?? undefined
        });
    };
}

function resolveEpisodeLocation(
    playback: PlaybackSession,
    item: JellyfinBaseItem
): EpisodeLocation | null {
    const seriesId = playback.seriesId || item.SeriesId || "";
    const seasonId = playback.seasonId || item.SeasonId || item.ParentId || "";
    const episodeIndex = Number.parseInt(String(playback.episodeIndex ?? item.IndexNumber), 10);
    if (!seriesId || !seasonId || Number.isNaN(episodeIndex)) {
        return null;
    }
    return { seriesId, seasonId, episodeIndex };
}

async function fetchItemDetails(
    port: AutoplayRequestPort,
    playback: PlaybackSession,
    itemId: string
): Promise<JellyfinBaseItem | null> {
    return port.requestJson<JellyfinBaseItem>(playback, {
        method: "GET",
        endpoint: `/Items/${encodeURIComponent(itemId)}`,
        query: {
            userId: playback.userId,
            fields: ITEM_DETAILS_FIELDS
        }
    });
}

async function fetchEpisodes(
    port: AutoplayRequestPort,
    playback: PlaybackSession,
    seriesId: string,
    seasonId: string
): Promise<JellyfinBaseItem[]> {
    const result = await port.requestJson<JellyfinBaseItemQuery>(playback, {
        method: "GET",
        endpoint: `/Shows/${encodeURIComponent(seriesId)}/Episodes`,
        query: {
            userId: playback.userId,
            seasonId,
            fields: FIELDS_EPISODES
        }
    });
    return (result?.Items || []).filter(item => item.Type === "Episode");
}

async function fetchSeasons(
    port: AutoplayRequestPort,
    playback: PlaybackSession,
    seriesId: string
): Promise<JellyfinBaseItem[]> {
    const result = await port.requestJson<JellyfinBaseItemQuery>(playback, {
        method: "GET",
        endpoint: `/Shows/${encodeURIComponent(seriesId)}/Seasons`,
        query: {
            userId: playback.userId,
            fields: FIELDS_SEASONS
        }
    });
    return result?.Items || [];
}

async function resolveSequentialNextEpisode(
    port: AutoplayRequestPort,
    playback: PlaybackSession,
    location: EpisodeLocation
): Promise<JellyfinBaseItem | null> {
    const nextEpisode = findNextEpisodeInSeason(
        await fetchEpisodes(port, playback, location.seriesId, location.seasonId),
        location.episodeIndex
    );
    if (nextEpisode) {
        return nextEpisode;
    }

    const seasons = await fetchSeasons(port, playback, location.seriesId);
    for (const nextSeason of getFollowingSeasons(seasons, location.seasonId)) {
        const firstEpisode = await findFirstEpisodeInNextSeason(port, playback, location.seriesId, nextSeason);
        if (firstEpisode) {
            return firstEpisode;
        }
    }
    return null;
}

async function findFirstEpisodeInNextSeason(
    port: AutoplayRequestPort,
    playback: PlaybackSession,
    seriesId: string,
    season: JellyfinBaseItem
): Promise<JellyfinBaseItem | null> {
    if (!season.Id) {
        return null;
    }
    return findFirstEpisodeInSeason(await fetchEpisodes(port, playback, seriesId, season.Id));
}

async function buildAutoplayStream(
    port: AutoplayRequestPort,
    playback: PlaybackSession,
    itemId: string,
    context: {
        seriesId: string;
        seasonId: string;
        episodeIndex?: number | null;
    }
) {
    const playbackInfo = await port.requestJson<JellyfinPlaybackInfoResponse>(playback, {
        method: "POST",
        endpoint: `/Items/${encodeURIComponent(itemId)}/PlaybackInfo`,
        body: buildPlaybackInfoRequest(playback.userId, IINA_DEVICE_PROFILE)
    });
    if (!playbackInfo) {
        throw new Error("Missing playback info");
    }

    const itemDetails = await fetchItemDetails(port, playback, itemId);
    return {
        handoff: buildPlaybackHandoff(playbackInfo, {
            serverUrl: playback.serverUrl,
            accessToken: playback.accessToken,
            deviceId: playback.deviceId,
            userId: playback.userId,
            itemId,
            runtimeTicks: itemDetails?.RunTimeTicks,
            seriesId: context.seriesId,
            seasonId: context.seasonId,
            episodeIndex: context.episodeIndex ?? undefined
        }),
        title: buildJellyfinWindowTitle(itemDetails, itemDetails?.Name || "")
    };
}

function hasPlaybackContext(playback: PlaybackSession): boolean {
    return Boolean(
        playback.serverUrl
        && playback.accessToken
        && playback.deviceId
        && playback.userId
    );
}
