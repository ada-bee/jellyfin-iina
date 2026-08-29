import type { PreviewBackdropsPayload } from "../shared/messages";

import { buildJellyfinImageUrl } from "../shared/images";
import { MESSAGE_NAMES } from "../shared/messages";
import { getAuthState } from "./state";

const { event, overlay } = iina;

let initialized = false;
let overlayReady = false;
let ambientBackdropEligible = false;
let backdropUrls: string[] = [];
let skipButtonLabel = "";
let skipSegmentHandler: (() => void) | null = null;

function syncOverlay(): void {
    if (!overlayReady) {
        return;
    }

    overlay.postMessage(MESSAGE_NAMES.OverlayBackdrops, {
        urls: ambientBackdropEligible ? backdropUrls : []
    });
    overlay.postMessage(MESSAGE_NAMES.OverlaySkipButton, {
        label: skipButtonLabel
    });

    overlay.setClickable(Boolean(skipButtonLabel));
    if ((ambientBackdropEligible && backdropUrls.length > 0) || skipButtonLabel) {
        overlay.show();
    } else {
        overlay.hide();
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
}

export function loadMediaOverlay(): void {
    overlayReady = false;
    overlay.loadFile("ui/overlay.html");
}

export function setAmbientBackdropEligibility(eligible: boolean): void {
    ambientBackdropEligible = eligible;
    if (!eligible) {
        backdropUrls = [];
    }
    syncOverlay();
}

export function previewBackdrops(payload: PreviewBackdropsPayload): void {
    if (!ambientBackdropEligible) {
        return;
    }

    const authState = getAuthState();
    if (!authState || !payload.itemId) {
        backdropUrls = [];
        syncOverlay();
        return;
    }

    backdropUrls = (payload.backdropTags || [])
        .filter((tag): tag is string => typeof tag === "string" && Boolean(tag))
        .map((tag, index) => buildJellyfinImageUrl({
            serverUrl: authState.serverUrl,
            accessToken: authState.accessToken,
            itemId: payload.itemId,
            imageType: "Backdrop",
            imageIndex: index,
            imageTag: tag,
            maxWidth: 1920
        }))
        .filter(Boolean);
    syncOverlay();
}

export function clearBackdropPreview(): void {
    backdropUrls = [];
    syncOverlay();
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
