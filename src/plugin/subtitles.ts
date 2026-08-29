import type { ExternalSubtitleTrack } from "../shared/jellyfin";
import type { PlaybackState } from "./state";

import { formatError } from "./utils";

export function loadExternalSubtitles(playback: PlaybackState): void {
    const { console, mpv } = iina;
    const orderedTracks = orderExternalSubtitleTracks(
        playback.externalSubtitles,
        playback.subtitleStreamIndex
    );
    for (const track of orderedTracks) {
        try {
            mpv.command("sub-add", [
                track.url,
                buildSubtitleFlags(track),
                track.title,
                track.language
            ]);
        } catch (error) {
            console.error(
                `Jellyfin: Failed to load subtitle track ${track.index}: ${formatError(error)}`
            );
        }
    }
}

export function orderExternalSubtitleTracks(
    tracks: ExternalSubtitleTrack[],
    selectedIndex: number | null | undefined
): ExternalSubtitleTrack[] {
    return [...tracks].sort((left, right) => {
        const leftSelected = left.index === selectedIndex ? 1 : 0;
        const rightSelected = right.index === selectedIndex ? 1 : 0;
        return leftSelected - rightSelected;
    });
}

export function buildSubtitleFlags(track: ExternalSubtitleTrack): string {
    const flags = [track.isDefault ? "select" : "auto"];
    if (track.isDefault) {
        flags.push("default");
    }
    if (track.isForced) {
        flags.push("forced");
    }
    if (track.isHearingImpaired) {
        flags.push("hearing-impaired");
    }
    return flags.join("+");
}
