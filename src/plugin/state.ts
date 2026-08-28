import type { AuthUpdatedPayload } from "../shared/messages";
import type { PlaybackContext } from "../shared/jellyfin";
import type { StoppedPlayback } from "../shared/playbackLifecycle";

import { PlaybackLifecycle } from "../shared/playbackLifecycle";
import { normalizeServerUrl } from "./utils";

export interface AuthState extends AuthUpdatedPayload {}

export interface NormalizedSegment {
    type: "Intro" | "Outro";
    startSeconds: number | null;
    endSeconds: number | null;
}

export interface PlaybackState extends PlaybackContext {
    isEpisode: boolean;
    autoplayQueued: boolean;
    autoplayRequestId: number;
    nextItemId: string;
    segments: NormalizedSegment[];
}

let authState: AuthState | null = null;
const playbackLifecycle = new PlaybackLifecycle<PlaybackState>();

export function updateAuthState(payload: AuthUpdatedPayload): AuthState {
    authState = {
        ...payload,
        serverUrl: normalizeServerUrl(payload.serverUrl)
    };
    return authState;
}

export function clearAuthState(): void {
    authState = null;
}

export function getAuthState(): AuthState | null {
    return authState;
}

export function startCurrentPlayback(playback: PlaybackState): void {
    playbackLifecycle.start(playback);
}

export function getCurrentPlayback(): PlaybackState | null {
    return playbackLifecycle.current;
}

export function updateCurrentPlaybackPosition(positionTicks: number): void {
    playbackLifecycle.updatePosition(positionTicks);
}

export function stopCurrentPlayback(positionTicks: number): StoppedPlayback<PlaybackState> | null {
    return playbackLifecycle.stop(positionTicks);
}
