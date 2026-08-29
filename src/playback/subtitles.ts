import type { ExternalSubtitleTrack } from "../jellyfin/types";

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
