import type { OverlayBackdropsPayload, OverlaySkipButtonPayload } from "../shared/messages";

import { MESSAGE_NAMES } from "../shared/messages";
import { resolvePlaylistIndex } from "./backdropSlideshow";

const SLIDESHOW_INTERVAL_MS = 8000;

const backdrop = document.getElementById("backdrop-preview") as HTMLElement;
const layers = Array.from(document.querySelectorAll<HTMLImageElement>(".backdrop-image"));
const skipButton = document.getElementById("skip-button") as HTMLButtonElement;

let playlistUrls: string[] = [];
let overrideUrl = "";
let eligible = false;
let currentPlaylistIndex = -1;
let displayedUrl = "";
let activeLayerIndex = 0;
let loadGeneration = 0;
let slideshowTimer: ReturnType<typeof setTimeout> | null = null;

function clearSlideshowTimer(): void {
    if (!slideshowTimer) {
        return;
    }
    clearTimeout(slideshowTimer);
    slideshowTimer = null;
}

function arraysEqual(left: string[], right: string[]): boolean {
    return left.length === right.length && left.every((value, index) => value === right[index]);
}

function preloadNextImage(index: number): void {
    if (playlistUrls.length < 2) {
        return;
    }
    const image = new Image();
    image.src = playlistUrls[(index + 1) % playlistUrls.length];
}

function scheduleNextImage(): void {
    clearSlideshowTimer();
    if (!eligible || overrideUrl || playlistUrls.length < 2) {
        return;
    }
    slideshowTimer = setTimeout(() => {
        const nextIndex = (Math.max(currentPlaylistIndex, 0) + 1) % playlistUrls.length;
        showPlaylistImage(nextIndex, playlistUrls.length);
    }, SLIDESHOW_INTERVAL_MS);
}

function showUrl(url: string, onLoad: () => void, onError: () => void): void {
    const activeLayer = layers[activeLayerIndex];
    if (
        displayedUrl === url &&
        activeLayer?.complete &&
        Boolean(activeLayer.naturalWidth)
    ) {
        backdrop.classList.add("visible");
        onLoad();
        return;
    }

    const generation = ++loadGeneration;
    const nextLayerIndex = activeLayerIndex === 0 ? 1 : 0;
    const nextLayer = layers[nextLayerIndex];
    nextLayer.onload = () => {
        if (generation !== loadGeneration || !eligible) {
            return;
        }
        layers[activeLayerIndex].classList.remove("active");
        nextLayer.classList.add("active");
        activeLayerIndex = nextLayerIndex;
        displayedUrl = url;
        backdrop.classList.add("visible");
        onLoad();
    };
    nextLayer.onerror = () => {
        if (generation !== loadGeneration || !eligible) {
            return;
        }
        onError();
    };
    nextLayer.classList.remove("active");
    nextLayer.src = url;
}

function showPlaylistImage(index: number, attemptsRemaining: number, allowDuringOverride = false): void {
    if (
        !eligible ||
        playlistUrls.length === 0 ||
        attemptsRemaining <= 0 ||
        (overrideUrl && !allowDuringOverride)
    ) {
        if (attemptsRemaining <= 0) {
            backdrop.classList.remove("visible");
        }
        return;
    }

    const normalizedIndex = index % playlistUrls.length;
    showUrl(
        playlistUrls[normalizedIndex],
        () => {
            currentPlaylistIndex = normalizedIndex;
            preloadNextImage(normalizedIndex);
            scheduleNextImage();
        },
        () => showPlaylistImage(
            (normalizedIndex + 1) % playlistUrls.length,
            attemptsRemaining - 1,
            allowDuringOverride
        )
    );
}

function showOverride(): void {
    clearSlideshowTimer();
    showUrl(
        overrideUrl,
        () => undefined,
        () => {
            if (playlistUrls.length === 0) {
                backdrop.classList.remove("visible");
                return;
            }
            showPlaylistImage(
                currentPlaylistIndex >= 0 ? currentPlaylistIndex : 0,
                playlistUrls.length,
                true
            );
        }
    );
}

function setBackdrops(payload: OverlayBackdropsPayload): void {
    const nextPlaylistUrls = Array.from(new Set((payload?.playlistUrls || []).filter(Boolean)));
    const nextOverrideUrl = payload?.overrideUrl || "";
    const nextEligible = Boolean(payload?.eligible);
    if (
        arraysEqual(playlistUrls, nextPlaylistUrls) &&
        overrideUrl === nextOverrideUrl &&
        eligible === nextEligible
    ) {
        return;
    }

    const currentPlaylistUrl = currentPlaylistIndex >= 0
        ? playlistUrls[currentPlaylistIndex]
        : "";
    const playlistChanged = !arraysEqual(playlistUrls, nextPlaylistUrls);
    const overrideEnded = Boolean(overrideUrl) && !nextOverrideUrl;
    playlistUrls = nextPlaylistUrls;
    overrideUrl = nextOverrideUrl;
    eligible = nextEligible;
    if (playlistChanged) {
        currentPlaylistIndex = currentPlaylistUrl
            ? playlistUrls.indexOf(currentPlaylistUrl)
            : -1;
    }

    clearSlideshowTimer();
    loadGeneration += 1;
    if (!eligible) {
        backdrop.classList.remove("visible");
        return;
    }
    if (overrideUrl) {
        showOverride();
        return;
    }
    if (playlistUrls.length > 0) {
        showPlaylistImage(
            resolvePlaylistIndex(currentPlaylistIndex, playlistUrls.length, overrideEnded),
            playlistUrls.length
        );
        return;
    }
    backdrop.classList.remove("visible");
}

function setSkipButton(payload: OverlaySkipButtonPayload): void {
    const label = payload?.label || "";
    skipButton.textContent = label;
    skipButton.classList.toggle("hidden", !label);
}

skipButton.addEventListener("click", () => {
    iina.postMessage(MESSAGE_NAMES.SkipSegment, {});
});

iina.onMessage(MESSAGE_NAMES.OverlayBackdrops, setBackdrops);
iina.onMessage(MESSAGE_NAMES.OverlaySkipButton, setSkipButton);
