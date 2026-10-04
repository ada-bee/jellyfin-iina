import type {
    PlaybackLogger,
    PlaybackSession,
    Player,
    PlaylistEntry,
    TrackSelection
} from "../../playback/ports";
import type { PlaybackHandoff } from "../../jellyfin/types";

import {
    resolveJellyfinTrackSelection,
    resolveMpvTrackIds,
    type MpvTrackInfo
} from "../../playback/tracks";
import { sanitizeMediaTitle } from "../../playback/title";
import { IinaExternalSubtitles } from "./externalSubtitles";
import { escapeMpvListItem, escapeMpvOption, mediaRequestHeaders } from "./mediaAuthentication";
import { isSameServerUrl } from "../../jellyfin/url";

export class IinaPlayer implements Player {
    private readonly subtitles: IinaExternalSubtitles;

    constructor(private readonly logger: PlaybackLogger) {
        this.subtitles = new IinaExternalSubtitles(logger);
    }

    getPath(): string {
        return iina.mpv.getString("path") || "";
    }

    getPositionSeconds(): number {
        return iina.mpv.getNumber("time-pos") || 0;
    }

    getDurationSeconds(): number {
        return iina.mpv.getNumber("duration") || 0;
    }

    isPaused(): boolean {
        return iina.mpv.getFlag("pause");
    }

    isEofReached(): boolean {
        return iina.mpv.getFlag("eof-reached");
    }

    pause(): void {
        iina.core.pause();
    }

    getPlaylist(): PlaylistEntry[] {
        const playlist = iina.mpv.getNative<PlaylistEntry[]>("playlist");
        return Array.isArray(playlist) ? playlist : [];
    }

    getTrackSelection(playback: PlaybackSession): TrackSelection {
        const trackList = iina.mpv.getNative<MpvTrackInfo[]>("track-list");
        const selection = resolveJellyfinTrackSelection(
            Array.isArray(trackList) ? trackList : null,
            this.subtitles.tracks(playback),
            {
                audioStreamIndex: playback.audioStreamIndex ?? null,
                subtitleStreamIndex: playback.subtitleStreamIndex ?? null
            }
        );
        return {
            ...selection,
            subtitleStreamIndex: this.subtitles.pendingSelection(playback) ?? selection.subtitleStreamIndex
        };
    }

    loadReplacement(handoff: PlaybackHandoff, title: string): void {
        iina.mpv.command("loadfile", buildLoadArguments(handoff, "replace", title));
    }

    loadNext(handoff: PlaybackHandoff, title: string): void {
        iina.mpv.command("loadfile", buildLoadArguments(handoff, "insert-next", title));
    }

    loadAppend(handoff: PlaybackHandoff, title: string): void {
        iina.mpv.command("loadfile", buildLoadArguments(handoff, "append", title));
    }

    removePlaylistEntry(index: number): void {
        iina.mpv.command("playlist-remove", [String(index)]);
    }

    setWindowTitle(title: string): void {
        if (!title) {
            return;
        }
        const safeTitle = sanitizeMediaTitle(title);
        const mpvWithSetString = iina.mpv as typeof iina.mpv & {
            setString?: (name: string, value: string) => void;
        };
        if (typeof mpvWithSetString.setString === "function") {
            mpvWithSetString.setString("force-media-title", safeTitle);
        } else {
            iina.mpv.set("force-media-title", safeTitle);
        }
        this.logger.debug("Jellyfin: Set window title to", safeTitle);
    }

    seek(seconds: number): void {
        iina.mpv.set("time-pos", seconds);
    }

    loadExternalSubtitles(playback: PlaybackSession): void {
        this.subtitles.load(playback);
    }

    clearExternalSubtitles(): void {
        this.subtitles.clear();
    }

    applyTrackSelection(playback: PlaybackSession): void {
        const trackList = iina.mpv.getNative<MpvTrackInfo[]>("track-list");
        const trackIds = resolveMpvTrackIds(
            Array.isArray(trackList) ? trackList : [],
            this.subtitles.tracks(playback),
            playback
        );
        applyMpvTrackId("aid", trackIds.audioTrackId);
        applyMpvTrackId("sid", trackIds.subtitleTrackId);
    }

    open(url: string): void {
        iina.core.open(url);
    }
}

function applyMpvTrackId(property: "aid" | "sid", trackId: number | null | undefined): void {
    if (trackId !== undefined) {
        iina.mpv.set(property, trackId === null ? "no" : trackId);
    }
}

function buildLoadArguments(
    handoff: PlaybackHandoff,
    mode: "replace" | "insert-next" | "append",
    title: string
): string[] {
    if (!isSameServerUrl(handoff.serverUrl, handoff.url)) {
        throw new Error("Jellyfin playback must use the configured HTTPS server.");
    }
    const headers = mediaRequestHeaders(handoff, handoff.url);
    const headerList = Object.entries(headers)
        .map(([key, value]) => escapeMpvListItem(`${key}: ${value}`)).join(",");
    const options = [`http-header-fields=${escapeMpvOption(headerList)}`];
    if (title) options.push(`force-media-title=${escapeMpvOption(sanitizeMediaTitle(title))}`);
    return [handoff.url, mode, "-1", options.join(",")];
}
