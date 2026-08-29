import type { ExternalSubtitleTrack } from "../jellyfin/types";

export interface MpvTrackInfo {
    type?: "audio" | "video" | "sub";
    selected?: boolean;
    external?: boolean;
    "main-selection"?: number;
    "ff-index"?: number;
    "external-filename"?: string;
}

export interface JellyfinTrackSelection {
    audioStreamIndex: number | null;
    subtitleStreamIndex: number | null;
}

export function resolveJellyfinTrackSelection(
    trackList: MpvTrackInfo[] | null,
    externalSubtitles: ExternalSubtitleTrack[],
    fallback: JellyfinTrackSelection
): JellyfinTrackSelection {
    if (!trackList || trackList.length === 0) {
        return fallback;
    }

    const audioTrack = findPrimarySelectedTrack(trackList, "audio");
    const subtitleTrack = findPrimarySelectedTrack(trackList, "sub");
    return {
        audioStreamIndex: getInternalStreamIndex(audioTrack),
        subtitleStreamIndex: getSubtitleStreamIndex(subtitleTrack, externalSubtitles)
    };
}

function findPrimarySelectedTrack(
    trackList: MpvTrackInfo[],
    type: "audio" | "sub"
): MpvTrackInfo | null {
    return trackList.find(track => (
        track.type === type
        && track.selected === true
        && (track["main-selection"] === undefined || track["main-selection"] === 0)
    )) || null;
}

function getInternalStreamIndex(track: MpvTrackInfo | null): number | null {
    return track && typeof track["ff-index"] === "number" ? track["ff-index"] : null;
}

function getSubtitleStreamIndex(
    track: MpvTrackInfo | null,
    externalSubtitles: ExternalSubtitleTrack[]
): number | null {
    if (!track) {
        return null;
    }
    if (!track.external) {
        return getInternalStreamIndex(track);
    }

    const filename = track["external-filename"] || "";
    return externalSubtitles.find(subtitle => subtitle.url === filename)?.index ?? null;
}
