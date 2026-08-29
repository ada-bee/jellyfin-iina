import type { JellyfinMediaSegmentQuery } from "../shared/jellyfin";
import type { NormalizedSegment } from "../shared/segments";

import { getActiveSegment, normalizeSegments, shouldShowSkipOverlay } from "../shared/segments";

import {
    SKIP_SEGMENT_POLL_INTERVAL_MS,
    SKIP_SEGMENT_PREF_KEY
} from "./constants";
import { requestJson } from "./http";
import { hideSkipButton, setSkipSegmentHandler, showSkipButton } from "./mediaOverlay";
import { getCurrentPlayback } from "./state";
import { formatError } from "./utils";

const { console, core, mpv, preferences } = iina;

let skipOverlayVisible = false;
let skipOverlayEnabled = true;
let skipOverlayInitialized = false;
let skipOverlayLabel = "";
let skipSegmentTimer: ReturnType<typeof setInterval> | null = null;
let activeSkipSegment: NormalizedSegment | null = null;

function isSkipSegmentsEnabled(): boolean {
    const value = preferences.get(SKIP_SEGMENT_PREF_KEY);
    if (value === undefined || value === null) {
        return true;
    }
    return Boolean(value);
}

function getSkipLabel(segment: NormalizedSegment | null): string {
    if (!segment) {
        return "";
    }
    if (segment.type === "Intro") {
        return "Skip Intro";
    }
    if (segment.type === "Outro") {
        return "Skip Credits";
    }
    return "Skip";
}

function showSkipOverlay(label: string): void {
    if (skipOverlayVisible) {
        if (label !== skipOverlayLabel) {
            showSkipButton(label);
            skipOverlayLabel = label;
        }
        return;
    }

    skipOverlayLabel = label;

    showSkipButton(label);
    skipOverlayVisible = true;

    if (!skipOverlayInitialized) {
        setSkipSegmentHandler(() => {
            if (!activeSkipSegment) {
                return;
            }
            const target = activeSkipSegment.endSeconds;
            if (typeof target === "number" && target > 0) {
                mpv.set("time-pos", Math.max(0, target + 0.5));
            }
            hideSkipOverlay();
        });
        skipOverlayInitialized = true;
    }
}

function hideSkipOverlay(): void {
    if (!skipOverlayVisible) {
        return;
    }
    hideSkipButton();
    skipOverlayVisible = false;
    skipOverlayLabel = "";
    activeSkipSegment = null;
}

async function requestMediaSegments(): Promise<void> {
    const playback = getCurrentPlayback();
    if (!playback || !playback.itemId) {
        return;
    }
    if (!playback.serverUrl || !playback.accessToken || !playback.deviceId) {
        return;
    }
    if (!playback.isEpisode) {
        playback.segments = [];
        return;
    }

    const expectedItemId = playback.itemId;
    try {
        const result = await requestJson<JellyfinMediaSegmentQuery>(
            {
                serverUrl: playback.serverUrl,
                accessToken: playback.accessToken,
                deviceId: playback.deviceId
            },
            {
                method: "GET",
                endpoint: `/MediaSegments/${encodeURIComponent(playback.itemId)}` +
                    "?includeSegmentTypes=Intro&includeSegmentTypes=Outro"
            }
        );

        const segments = (result?.Items || []).map((segment) => ({
            Type: segment.Type,
            StartTicks: segment.StartTicks,
            EndTicks: segment.EndTicks
        }));

        const latestPlayback = getCurrentPlayback();
        if (!latestPlayback || latestPlayback.itemId !== expectedItemId) {
            return;
        }

        const fallbackDuration = typeof core.status.duration === "number" ? core.status.duration : 0;
        latestPlayback.segments = normalizeSegments(
            segments,
            latestPlayback.runtimeTicks,
            fallbackDuration
        );
    } catch (error) {
        console.error(`Jellyfin: Failed to fetch media segments: ${formatError(error)}`);
        const latestPlayback = getCurrentPlayback();
        if (latestPlayback && latestPlayback.itemId === expectedItemId) {
            latestPlayback.segments = [];
        }
    }
}

function refreshSkipSegmentPreference(): void {
    const enabled = isSkipSegmentsEnabled();
    if (enabled !== skipOverlayEnabled) {
        skipOverlayEnabled = enabled;
        if (!skipOverlayEnabled) {
            hideSkipOverlay();
            return;
        }

        void requestMediaSegments();
    }
}

export function startSegmentPolling(): void {
    stopSegmentPolling();
    refreshSkipSegmentPreference();
    if (skipOverlayEnabled) {
        void requestMediaSegments();
    }

    skipSegmentTimer = setInterval(() => {
        refreshSkipSegmentPreference();
        const playback = getCurrentPlayback();
        if (!skipOverlayEnabled || !playback) {
            hideSkipOverlay();
            return;
        }

        const positionSeconds = mpv.getNumber("time-pos") || 0;
        const segment = getActiveSegment(positionSeconds, playback.segments);

        if (segment && shouldShowSkipOverlay(segment)) {
            const label = getSkipLabel(segment);
            activeSkipSegment = segment;
            showSkipOverlay(label);
        } else {
            hideSkipOverlay();
        }
    }, SKIP_SEGMENT_POLL_INTERVAL_MS);
}

export function stopSegmentPolling(): void {
    if (skipSegmentTimer) {
        clearInterval(skipSegmentTimer);
        skipSegmentTimer = null;
    }
}

export function clearSegmentState(): void {
    stopSegmentPolling();
    hideSkipOverlay();
    activeSkipSegment = null;
    const playback = getCurrentPlayback();
    if (playback) {
        playback.segments = [];
    }
}
