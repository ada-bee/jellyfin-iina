import type { ExternalSubtitleTrack } from "../jellyfin/types";

export interface MpvTrackInfo {
    id?: number;
    type?: "audio" | "video" | "sub";
    selected?: boolean;
    external?: boolean;
    "main-selection"?: number;
    "ff-index"?: number;
    "external-filename"?: string;
}

export interface MpvTrackIds {
    audioTrackId?: number | null;
    subtitleTrackId?: number | null;
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

export function resolveMpvTrackIds(
    trackList: MpvTrackInfo[],
    externalSubtitles: ExternalSubtitleTrack[],
    selection: {
        audioStreamIndex?: number | null;
        subtitleStreamIndex?: number | null;
    }
): MpvTrackIds {
    return {
        audioTrackId: findMpvTrackId(
            trackList,
            "audio",
            selection.audioStreamIndex,
            externalSubtitles
        ),
        subtitleTrackId: findMpvTrackId(
            trackList,
            "sub",
            selection.subtitleStreamIndex,
            externalSubtitles
        )
    };
}

function findMpvTrackId(
    trackList: MpvTrackInfo[],
    type: "audio" | "sub",
    streamIndex: number | null | undefined,
    externalSubtitles: ExternalSubtitleTrack[]
): number | null | undefined {
    if (streamIndex === undefined || streamIndex === null) {
        return streamIndex;
    }
    const externalUrl = externalSubtitles.find(track => track.index === streamIndex)?.url;
    const track = trackList.find(candidate => (
        candidate.type === type
        && (candidate["ff-index"] === streamIndex
            || Boolean(externalUrl && candidate["external-filename"] === externalUrl))
    ));
    return typeof track?.id === "number" ? track.id : undefined;
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
