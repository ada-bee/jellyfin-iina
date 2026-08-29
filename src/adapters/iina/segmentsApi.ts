import type { PlaybackSession } from "../../playback/ports";
import type { JellyfinMediaSegmentQuery } from "../../jellyfin/types";
import type { NormalizedSegment } from "../../playback/segments";

import { normalizeSegments } from "../../playback/segments";
import { requestJson } from "./apiClient";

export async function requestMediaSegments(
    playback: PlaybackSession
): Promise<NormalizedSegment[]> {
    if (
        !playback.isEpisode
        || !playback.itemId
        || !playback.serverUrl
        || !playback.accessToken
        || !playback.deviceId
    ) {
        return [];
    }

    const result = await requestJson<JellyfinMediaSegmentQuery>(playback, {
        method: "GET",
        endpoint: `/MediaSegments/${encodeURIComponent(playback.itemId)}`
            + "?includeSegmentTypes=Intro&includeSegmentTypes=Outro"
    });
    const segments = (result?.Items || []).map((segment) => ({
        Type: segment.Type,
        StartTicks: segment.StartTicks,
        EndTicks: segment.EndTicks
    }));
    return normalizeSegments(segments, playback.runtimeTicks, 0);
}
