import type { JellyfinBaseItem, JellyfinBaseItemQuery, JellyfinPlaybackInfoResponse } from "../shared/jellyfin";

import {
    findFirstEpisodeInSeason,
    findNextEpisodeInSeason,
    getFollowingSeasons
} from "../shared/autoplay";
import { IINA_DEVICE_PROFILE } from "../shared/deviceProfile";
import {
    buildJellyfinWindowTitle,
    buildPlaybackHandoff,
    buildPlaybackInfoRequest
} from "../shared/playback";

import { AUTOPLAY_NEXT_PREF_KEY, FIELDS_EPISODES, FIELDS_SEASONS, ITEM_DETAILS_FIELDS } from "./constants";
import { requestJson } from "./http";
import { getRegisteredPlaybackItemId, registerPlaybackHandoff } from "./handoffs";
import { getAuthState, getCurrentPlayback } from "./state";
import { formatError, logDebug, sanitizeMediaTitle } from "./utils";

const { console, mpv, preferences } = iina;

let autoplayRequestCounter = 0;

function isAutoplayNextEnabled(): boolean {
    const value = preferences.get(AUTOPLAY_NEXT_PREF_KEY);
    if (value === undefined || value === null) {
        return true;
    }
    return Boolean(value);
}

function getUserId(): string {
    const playback = getCurrentPlayback();
    if (playback?.userId) {
        return playback.userId;
    }
    const authState = getAuthState();
    return authState?.userId || "";
}

function getHttpContext() {
    const playback = getCurrentPlayback();
    if (!playback) {
        return null;
    }

    const authState = getAuthState();
    const serverUrl = playback.serverUrl || authState?.serverUrl || "";
    const accessToken = playback.accessToken || authState?.accessToken || "";
    const deviceId = playback.deviceId || authState?.deviceId || "";
    if (!serverUrl || !accessToken || !deviceId) {
        return null;
    }
    return {
        serverUrl: serverUrl,
        accessToken: accessToken,
        deviceId: deviceId
    };
}


function findCurrentPlaylistIndex(playlist: { current?: boolean; playing?: boolean }[]): number {
    if (!Array.isArray(playlist)) {
        return -1;
    }
    return playlist.findIndex((entry) => entry && (entry.current || entry.playing));
}

function prunePlaylistToCurrentEntry(): void {
    const playlist = mpv.getNative<{ filename: string; current?: boolean; playing?: boolean }[]>("playlist");
    if (!Array.isArray(playlist)) {
        return;
    }

    const currentIndex = findCurrentPlaylistIndex(playlist);
    if (currentIndex === -1) {
        return;
    }

    for (let i = playlist.length - 1; i >= 0; i -= 1) {
        if (i !== currentIndex) {
            mpv.command("playlist-remove", [String(i)]);
        }
    }
}

function queueNextEpisode(
    playbackHandoff: ReturnType<typeof buildPlaybackHandoff>,
    title: string
): void {
    const playback = getCurrentPlayback();
    if (!playback) {
        return;
    }

    try {
        const playlist = mpv.getNative<{ filename: string; current?: boolean; playing?: boolean }[]>("playlist");
        const currentIndex = findCurrentPlaylistIndex(playlist || []);

        if (currentIndex !== -1 && playlist) {
            const nextEntry = playlist[currentIndex + 1];
            const nextItemId = nextEntry?.filename
                ? getRegisteredPlaybackItemId(nextEntry.filename)
                : "";

            if (nextItemId && nextItemId === playback.nextItemId) {
                playback.autoplayQueued = true;
                return;
            }

            for (let i = playlist.length - 1; i > currentIndex; i -= 1) {
                mpv.command("playlist-remove", [String(i)]);
            }
        }

        registerPlaybackHandoff(playbackHandoff);
        if (title) {
            const safeTitle = sanitizeMediaTitle(title);
            mpv.command("loadfile", [playbackHandoff.url, "insert-next", "-1", `force-media-title=${safeTitle}`]);
        } else {
            mpv.command("loadfile", [playbackHandoff.url, "insert-next"]);
        }
        playback.autoplayQueued = true;
        logDebug("Jellyfin: Queued next episode");
    } catch (error) {
        console.error(`Jellyfin: Failed to queue next episode: ${formatError(error)}`);
    }
}

async function fetchItemDetails(itemId: string): Promise<JellyfinBaseItem | null> {
    const httpContext = getHttpContext();
    const userId = getUserId();
    if (!httpContext || !userId || !getCurrentPlayback()) {
        return null;
    }

    return await requestJson<JellyfinBaseItem>(httpContext, {
        method: "GET",
        endpoint: `/Users/${userId}/Items/${itemId}`,
        query: {
            Fields: ITEM_DETAILS_FIELDS
        }
    });
}

async function fetchEpisodes(seriesId: string, seasonId: string): Promise<JellyfinBaseItem[]> {
    const httpContext = getHttpContext();
    const userId = getUserId();
    if (!httpContext || !userId) {
        return [];
    }

    const result = await requestJson<JellyfinBaseItemQuery>(httpContext, {
        method: "GET",
        endpoint: `/Shows/${seriesId}/Episodes`,
        query: {
            UserId: userId,
            SeasonId: seasonId,
            Fields: FIELDS_EPISODES
        }
    });

    return (result?.Items || []).filter((item) => item.Type === "Episode");
}

async function fetchSeasons(seriesId: string): Promise<JellyfinBaseItem[]> {
    const httpContext = getHttpContext();
    const userId = getUserId();
    if (!httpContext || !userId) {
        return [];
    }

    const result = await requestJson<JellyfinBaseItemQuery>(httpContext, {
        method: "GET",
        endpoint: `/Shows/${seriesId}/Seasons`,
        query: {
            UserId: userId,
            Fields: FIELDS_SEASONS
        }
    });

    return result?.Items || [];
}

async function resolveSequentialNextEpisode(
    seriesId: string,
    seasonId: string,
    episodeIndex: number
): Promise<JellyfinBaseItem | null> {
    const episodes = await fetchEpisodes(seriesId, seasonId);
    const nextEpisode = findNextEpisodeInSeason(episodes, episodeIndex);
    if (nextEpisode) {
        return nextEpisode;
    }

    const seasons = await fetchSeasons(seriesId);
    if (!Array.isArray(seasons) || seasons.length === 0) {
        return null;
    }

    for (const nextSeason of getFollowingSeasons(seasons, seasonId)) {
        if (!nextSeason.Id) {
            continue;
        }
        const nextEpisodeInSeason = findFirstEpisodeInSeason(
            await fetchEpisodes(seriesId, nextSeason.Id)
        );
        if (nextEpisodeInSeason) {
            return nextEpisodeInSeason;
        }
    }

    return null;
}

async function buildAutoplayStream(itemId: string, context: {
    seriesId: string;
    seasonId: string;
    episodeIndex?: number | null;
}) {
    const httpContext = getHttpContext();
    const userId = getUserId();
    if (!httpContext || !userId) {
        throw new Error("Missing playback context");
    }

    const playbackInfo = await requestJson<JellyfinPlaybackInfoResponse>(httpContext, {
        method: "POST",
        endpoint: `/Items/${itemId}/PlaybackInfo`,
        body: buildPlaybackInfoRequest(userId, IINA_DEVICE_PROFILE)
    });

    if (!playbackInfo) {
        throw new Error("Missing playback info");
    }
    const itemDetails = await fetchItemDetails(itemId);
    const windowTitle = buildJellyfinWindowTitle(itemDetails, itemDetails?.Name || "");

    const playbackHandoff = buildPlaybackHandoff(playbackInfo, {
        serverUrl: httpContext.serverUrl,
        accessToken: httpContext.accessToken,
        deviceId: httpContext.deviceId,
        userId: userId,
        itemId: itemId,
        runtimeTicks: itemDetails?.RunTimeTicks,
        seriesId: context.seriesId,
        seasonId: context.seasonId,
        episodeIndex: context.episodeIndex ?? undefined
    });

    return {
        playback: playbackHandoff,
        title: windowTitle
    };
}

export function shouldRequestAutoplay(): boolean {
    return isAutoplayNextEnabled();
}

export function resetPlaylistAfterReplace(): void {
    prunePlaylistToCurrentEntry();
}

export async function requestAutoplayNextEpisode(): Promise<void> {
    const playback = getCurrentPlayback();
    if (!playback || !playback.isEpisode) {
        return;
    }

    const httpContext = getHttpContext();
    const userId = getUserId();
    if (!httpContext || !userId) {
        return;
    }

    autoplayRequestCounter += 1;
    const requestId = autoplayRequestCounter;
    playback.autoplayRequestId = requestId;
    playback.autoplayQueued = false;

    try {
        const itemDetails = await fetchItemDetails(playback.itemId);
        if (!itemDetails || itemDetails.Type !== "Episode") {
            playback.nextItemId = "";
            return;
        }

        const seriesId = playback.seriesId || itemDetails.SeriesId || "";
        const seasonId = playback.seasonId || itemDetails.SeasonId || itemDetails.ParentId || "";
        const episodeIndexValue = playback.episodeIndex ?? itemDetails.IndexNumber;
        const episodeIndex = Number.parseInt(String(episodeIndexValue), 10);

        if (!seriesId || !seasonId || Number.isNaN(episodeIndex)) {
            playback.nextItemId = "";
            return;
        }

        const nextEpisode = await resolveSequentialNextEpisode(seriesId, seasonId, episodeIndex);
        if (!nextEpisode || nextEpisode.Id === playback.itemId) {
            playback.nextItemId = "";
            return;
        }

        const streamData = await buildAutoplayStream(nextEpisode.Id || "", {
            seriesId: nextEpisode.SeriesId || seriesId,
            seasonId: nextEpisode.SeasonId || nextEpisode.ParentId || seasonId,
            episodeIndex: nextEpisode.IndexNumber ?? undefined
        });

        const latestPlayback = getCurrentPlayback();
        if (!latestPlayback || latestPlayback.autoplayRequestId !== requestId) {
            return;
        }

        latestPlayback.nextItemId = nextEpisode.Id || "";
        queueNextEpisode(streamData.playback, streamData.title || "");
    } catch (error) {
        const latestPlayback = getCurrentPlayback();
        if (latestPlayback && latestPlayback.autoplayRequestId === requestId) {
            latestPlayback.nextItemId = "";
            latestPlayback.autoplayQueued = false;
        }
        console.error(`Jellyfin: Autoplay lookup failed: ${formatError(error)}`);
    }
}
