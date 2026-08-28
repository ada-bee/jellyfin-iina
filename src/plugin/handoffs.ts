import type { PlaybackHandoff } from "../shared/jellyfin";

const handoffsByUrl = new Map<string, PlaybackHandoff>();

export function registerPlaybackHandoff(handoff: PlaybackHandoff): void {
    handoffsByUrl.set(handoff.url, handoff);
}

export function takePlaybackHandoff(url: string): PlaybackHandoff | null {
    const handoff = handoffsByUrl.get(url) || null;
    if (handoff) {
        handoffsByUrl.delete(url);
    }
    return handoff;
}

export function getRegisteredPlaybackItemId(url: string): string {
    return handoffsByUrl.get(url)?.itemId || "";
}

export function clearPlaybackHandoffs(): void {
    handoffsByUrl.clear();
}
