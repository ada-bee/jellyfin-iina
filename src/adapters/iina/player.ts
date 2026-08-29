import type {
    PlaybackLogger,
    PlaybackSession,
    Player,
    PlaylistEntry,
    TrackSelection
} from "../../playback/ports";
import type { PlaybackHandoff } from "../../jellyfin/types";

import { orderExternalSubtitleTracks, buildSubtitleFlags } from "../../playback/subtitles";
import { resolveJellyfinTrackSelection, type MpvTrackInfo } from "../../playback/tracks";
import { sanitizeMediaTitle } from "../../playback/title";

export class IinaPlayer implements Player {
    constructor(private readonly logger: PlaybackLogger) {}

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

    getPlaylist(): PlaylistEntry[] {
        const playlist = iina.mpv.getNative<PlaylistEntry[]>("playlist");
        return Array.isArray(playlist) ? playlist : [];
    }

    getTrackSelection(playback: PlaybackSession): TrackSelection {
        const trackList = iina.mpv.getNative<MpvTrackInfo[]>("track-list");
        return resolveJellyfinTrackSelection(
            Array.isArray(trackList) ? trackList : null,
            playback.externalSubtitles,
            {
                audioStreamIndex: playback.audioStreamIndex ?? null,
                subtitleStreamIndex: playback.subtitleStreamIndex ?? null
            }
        );
    }

    loadReplacement(handoff: PlaybackHandoff, title: string): void {
        iina.mpv.command("loadfile", buildLoadArguments(handoff.url, "replace", title));
    }

    loadNext(handoff: PlaybackHandoff, title: string): void {
        iina.mpv.command("loadfile", buildLoadArguments(handoff.url, "insert-next", title));
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
        const orderedTracks = orderExternalSubtitleTracks(
            playback.externalSubtitles,
            playback.subtitleStreamIndex
        );
        for (const track of orderedTracks) {
            try {
                iina.mpv.command("sub-add", [
                    track.url,
                    buildSubtitleFlags(track),
                    track.title,
                    track.language
                ]);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                this.logger.error(
                    `Jellyfin: Failed to load subtitle track ${track.index}: ${message}`
                );
            }
        }
    }

    open(url: string): void {
        iina.core.open(url);
    }
}

function buildLoadArguments(url: string, mode: "replace" | "insert-next", title: string): string[] {
    if (!title) {
        return [url, mode];
    }
    return [url, mode, "-1", `force-media-title=${sanitizeMediaTitle(title)}`];
}
