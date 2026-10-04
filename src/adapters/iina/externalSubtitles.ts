import type { ExternalSubtitleTrack } from "../../jellyfin/types";
import type { PlaybackLogger, PlaybackSession } from "../../playback/ports";
import type { MpvTrackInfo } from "../../playback/tracks";
import { mediaRequestHeaders } from "./mediaAuthentication";

interface SubtitleLoad {
    generation: number;
    playback: PlaybackSession;
    mediaPath: string;
    initialSid: string;
    selectedIndex: number | null | undefined;
    pending: Set<number>;
    tracks: ExternalSubtitleTrack[];
}

export class IinaExternalSubtitles {
    private generation = 0;
    private loadState: SubtitleLoad | null = null;
    private readonly files = new Set<string>();
    private readonly instanceId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    constructor(private readonly logger: PlaybackLogger) {}

    load(playback: PlaybackSession): void {
        this.clear();
        const state: SubtitleLoad = {
            generation: this.generation,
            playback,
            mediaPath: iina.mpv.getString("path") || "",
            initialSid: currentSubtitleId(),
            selectedIndex: playback.subtitleStreamIndex,
            pending: new Set(playback.externalSubtitles.map(track => track.index)),
            tracks: playback.externalSubtitles.map(track => ({ ...track, localPath: undefined }))
        };
        this.loadState = state;
        for (const track of state.tracks) {
            void this.downloadTrack(state, track);
        }
    }

    clear(): void {
        this.generation += 1;
        this.loadState = null;
        for (const path of this.files) {
            this.removeFile(path);
        }
        this.files.clear();
    }

    tracks(playback: PlaybackSession): ExternalSubtitleTrack[] {
        return this.loadState?.playback === playback
            ? this.loadState.tracks
            : playback.externalSubtitles;
    }

    pendingSelection(playback: PlaybackSession): number | undefined {
        const state = this.loadState;
        if (state?.playback !== playback || typeof state.selectedIndex !== "number") {
            return undefined;
        }
        return state.pending.has(state.selectedIndex) && this.selectionUnchanged(state)
            ? state.selectedIndex
            : undefined;
    }

    private async downloadTrack(state: SubtitleLoad, track: ExternalSubtitleTrack): Promise<void> {
        const path = this.temporaryPath(state, track);
        try {
            await iina.http.download(track.url, path, {
                method: "GET",
                headers: mediaRequestHeaders(state.playback, track.url),
                params: {},
                data: {}
            });
            if (!this.isCurrent(state)) {
                this.removeFile(path);
                return;
            }
            this.files.add(path);
            this.addTrack(state, track, path);
        } catch {
            this.removeFile(path);
            if (this.isCurrent(state)) {
                this.logger.error(`Jellyfin: Failed to load subtitle track ${track.index}.`);
            }
        } finally {
            state.pending.delete(track.index);
        }
    }

    private addTrack(state: SubtitleLoad, track: ExternalSubtitleTrack, path: string): void {
        const localPath = iina.utils.resolvePath(path);
        if (!localPath || !iina.file.exists(path)) {
            throw new Error("Subtitle download did not create a local file.");
        }
        const select = track.index === state.selectedIndex && this.selectionUnchanged(state);
        const previousSid = currentSubtitleId();
        track.localPath = localPath;
        // Only select the negotiated track while the user's choice remains unchanged.
        iina.mpv.command("sub-add", [
            localPath, select ? "select" : "auto", track.title, track.language
        ]);
        if (!select) {
            iina.mpv.set("sid", previousSid);
        }
        const tracks = iina.mpv.getNative<MpvTrackInfo[]>("track-list");
        if (!tracks?.some(candidate => candidate["external-filename"] === localPath)) {
            track.localPath = undefined;
            throw new Error("The player could not read the subtitle file.");
        }
    }

    private isCurrent(state: SubtitleLoad): boolean {
        return state.generation === this.generation
            && iina.mpv.getString("path") === state.mediaPath;
    }

    private selectionUnchanged(state: SubtitleLoad): boolean {
        return currentSubtitleId() === state.initialSid;
    }

    private temporaryPath(state: SubtitleLoad, track: ExternalSubtitleTrack): string {
        const match = track.url.match(/\.([a-z0-9]+)(?:[?#]|$)/i);
        const format = match?.[1]?.toLowerCase() || "srt";
        const extension = format === "pgssub" ? "sup" : format;
        return `@tmp/jellyfin-${this.instanceId}-${state.generation}-${track.index}.${extension}`;
    }

    private removeFile(path: string): void {
        this.files.delete(path);
        try {
            if (iina.file.exists(path)) iina.file.delete(path);
        } catch {
            this.logger.error("Jellyfin: Failed to remove a temporary subtitle file.");
        }
    }
}

function currentSubtitleId(): string {
    return iina.mpv.getString("sid") || "no";
}
