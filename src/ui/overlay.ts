import type { OverlayBackdropsPayload, OverlaySkipButtonPayload } from "../shared/messages";

import { MESSAGE_NAMES } from "../shared/messages";

const SLIDESHOW_INTERVAL_MS = 10000;

const backdrop = document.getElementById("backdrop-preview") as HTMLElement;
const layers = Array.from(document.querySelectorAll<HTMLImageElement>(".backdrop-image"));
const skipButton = document.getElementById("skip-button") as HTMLButtonElement;

let urls: string[] = [];
let currentIndex = -1;
let activeLayerIndex = 0;
let loadGeneration = 0;
let slideshowTimer: ReturnType<typeof setTimeout> | null = null;

function clearSlideshowTimer(): void {
    if (slideshowTimer) {
        clearTimeout(slideshowTimer);
        slideshowTimer = null;
    }
}

function arraysEqual(left: string[], right: string[]): boolean {
    return left.length === right.length && left.every((value, index) => value === right[index]);
}

function preloadNextImage(index: number): void {
    if (urls.length < 2) {
        return;
    }
    const image = new Image();
    image.src = urls[(index + 1) % urls.length];
}

function scheduleNextImage(): void {
    clearSlideshowTimer();
    if (urls.length < 2) {
        return;
    }
    slideshowTimer = setTimeout(() => {
        showImage((currentIndex + 1) % urls.length, urls.length);
    }, SLIDESHOW_INTERVAL_MS);
}

function showImage(index: number, attemptsRemaining: number): void {
    if (urls.length === 0 || attemptsRemaining <= 0) {
        backdrop.classList.remove("visible");
        return;
    }

    const generation = loadGeneration;
    const nextLayerIndex = activeLayerIndex === 0 ? 1 : 0;
    const nextLayer = layers[nextLayerIndex];
    const normalizedIndex = index % urls.length;

    nextLayer.onload = () => {
        if (generation !== loadGeneration) {
            return;
        }
        layers[activeLayerIndex].classList.remove("active");
        nextLayer.classList.add("active");
        activeLayerIndex = nextLayerIndex;
        currentIndex = normalizedIndex;
        backdrop.classList.add("visible");
        preloadNextImage(normalizedIndex);
        scheduleNextImage();
    };
    nextLayer.onerror = () => {
        if (generation !== loadGeneration) {
            return;
        }
        showImage((normalizedIndex + 1) % urls.length, attemptsRemaining - 1);
    };
    nextLayer.classList.remove("active");
    nextLayer.src = urls[normalizedIndex];
}

function setBackdrops(payload: OverlayBackdropsPayload): void {
    const nextUrls = (payload?.urls || []).filter(Boolean);
    if (arraysEqual(urls, nextUrls)) {
        return;
    }

    clearSlideshowTimer();
    loadGeneration += 1;
    urls = nextUrls;
    currentIndex = -1;

    if (urls.length === 0) {
        backdrop.classList.remove("visible");
        return;
    }
    showImage(0, urls.length);
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
