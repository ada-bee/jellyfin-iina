import type { BackdropContextPayload } from "../../jellyfin/messages";

import { buildJellyfinImageUrl } from "../../jellyfin/images";
import { MESSAGE_NAMES } from "../../jellyfin/messages";
import { getAuthState } from "../../jellyfin/session";

const { event, overlay } = iina;

const OVERLAY_HIDE_DELAY_MS = 450;

let initialized = false;
let overlayReady = false;
let backdropEligible = false;
let playlistItemIds: string[] = [];
let overrideItemId = "";
let skipButtonLabel = "";
let skipSegmentHandler: (() => void) | null = null;
let overlayHideTimer: ReturnType<typeof setTimeout> | null = null;

function clearOverlayHideTimer(): void {
    if (!overlayHideTimer) {
        return;
    }
    clearTimeout(overlayHideTimer);
    overlayHideTimer = null;
}

function scheduleOverlayHide(): void {
    clearOverlayHideTimer();
    overlayHideTimer = setTimeout(() => {
        overlayHideTimer = null;
        overlay.hide();
    }, OVERLAY_HIDE_DELAY_MS);
}

function syncOverlay(): void {
    if (!overlayReady) {
        return;
    }

    const playlistUrls = playlistItemIds.map(buildBackdropUrl).filter(Boolean);
    const overrideUrl = overrideItemId ? buildBackdropUrl(overrideItemId) : "";
    const shouldShowOverlay = (backdropEligible && (playlistUrls.length > 0 || overrideUrl))
        || Boolean(skipButtonLabel);
    if (shouldShowOverlay) {
        clearOverlayHideTimer();
        overlay.show();
    }

    overlay.postMessage(MESSAGE_NAMES.OverlayBackdrops, {
        playlistUrls,
        overrideUrl,
        eligible: backdropEligible
    });
    overlay.postMessage(MESSAGE_NAMES.OverlaySkipButton, {
        label: skipButtonLabel
    });

    overlay.setClickable(Boolean(skipButtonLabel));
    if (!shouldShowOverlay) {
        scheduleOverlayHide();
    }
}

export function initializeMediaOverlay(): void {
    if (initialized) {
        return;
    }
    initialized = true;

    event.on("iina.plugin-overlay-loaded", () => {
        overlayReady = true;
        overlay.onMessage(MESSAGE_NAMES.SkipSegment, () => {
            skipSegmentHandler?.();
        });
        syncOverlay();
    });
    event.on("iina.window-will-close", clearOverlayHideTimer);
}

export function loadMediaOverlay(): void {
    clearOverlayHideTimer();
    overlayReady = false;
    overlay.loadFile("ui/overlay.html");
}

export function setBackdropEligibility(eligible: boolean): void {
    if (backdropEligible === eligible) {
        return;
    }
    backdropEligible = eligible;
    syncOverlay();
}

export function setBackdropContext(payload: BackdropContextPayload): void {
    playlistItemIds = Array.from(new Set(
        (payload?.itemIds || []).filter(
            (itemId): itemId is string => typeof itemId === "string" && Boolean(itemId)
        )
    ));
    overrideItemId = typeof payload?.overrideItemId === "string" ? payload.overrideItemId : "";
    syncOverlay();
}

export function clearBackdropContext(): void {
    playlistItemIds = [];
    overrideItemId = "";
    syncOverlay();
}

export function refreshMediaOverlay(): void {
    syncOverlay();
}

function buildBackdropUrl(itemId: string): string {
    const authState = getAuthState();
    if (!authState) {
        return "";
    }
    return buildJellyfinImageUrl({
        serverUrl: authState.serverUrl,
        accessToken: authState.accessToken,
        itemId,
        imageType: "Backdrop",
        imageIndex: 0,
        maxWidth: 1920
    });
}

export function showSkipButton(label: string): void {
    skipButtonLabel = label;
    syncOverlay();
}

export function hideSkipButton(): void {
    skipButtonLabel = "";
    syncOverlay();
}

export function setSkipSegmentHandler(handler: () => void): void {
    skipSegmentHandler = handler;
}
