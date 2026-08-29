import type { OverlayBackdropsPayload, OverlaySkipButtonPayload } from "../jellyfin/messages";

const DEFAULT_SLIDESHOW_INTERVAL_MS = 8000;

export interface OverlayScheduler {
    setTimeout(callback: () => void, delayMs: number): unknown;
    clearTimeout(handle: unknown): void;
}

export interface OverlayView {
    hideBackdrop(): void;
    loadBackdrop(url: string, onLoad: (backdrop: LoadedBackdrop) => void, onError: () => void): void;
    preloadBackdrop(url: string): void;
    setBackdropVisible(): void;
    setSkipButton(label: string): void;
}

export interface LoadedBackdrop {
    display(): void;
}

export interface OverlayControllerOptions {
    view: OverlayView;
    scheduler: OverlayScheduler;
    onSkipRequested: () => void;
    slideshowIntervalMs?: number;
}

export interface OverlayController {
    requestSkip(): void;
    setBackdrops(payload: OverlayBackdropsPayload): void;
    setSkipButton(payload: OverlaySkipButtonPayload): void;
}

export function createOverlayController(options: OverlayControllerOptions): OverlayController {
    const intervalMs = options.slideshowIntervalMs ?? DEFAULT_SLIDESHOW_INTERVAL_MS;
    let playlistUrls: string[] = [];
    let overrideUrl = "";
    let eligible = false;
    let currentPlaylistIndex = -1;
    let loadGeneration = 0;
    let slideshowTimer: unknown | null = null;
    let skipLabel = "";

    function clearSlideshowTimer(): void {
        if (slideshowTimer === null) {
            return;
        }
        options.scheduler.clearTimeout(slideshowTimer);
        slideshowTimer = null;
    }

    function preloadNextImage(index: number): void {
        if (playlistUrls.length < 2) {
            return;
        }
        options.view.preloadBackdrop(playlistUrls[(index + 1) % playlistUrls.length]);
    }

    function scheduleNextImage(): void {
        clearSlideshowTimer();
        if (!eligible || overrideUrl || playlistUrls.length < 2) {
            return;
        }
        slideshowTimer = options.scheduler.setTimeout(() => {
            slideshowTimer = null;
            const nextIndex = (Math.max(currentPlaylistIndex, 0) + 1) % playlistUrls.length;
            showPlaylistImage(nextIndex, playlistUrls.length);
        }, intervalMs);
    }

    function showUrl(url: string, onLoad: () => void, onError: () => void): void {
        const generation = ++loadGeneration;
        options.view.loadBackdrop(
            url,
            backdrop => {
                if (generation !== loadGeneration || !eligible) {
                    return;
                }
                backdrop.display();
                options.view.setBackdropVisible();
                onLoad();
            },
            () => {
                if (generation !== loadGeneration || !eligible) {
                    return;
                }
                onError();
            }
        );
    }

    function showPlaylistImage(index: number, attemptsRemaining: number, allowDuringOverride = false): void {
        if (
            !eligible ||
            playlistUrls.length === 0 ||
            attemptsRemaining <= 0 ||
            (overrideUrl && !allowDuringOverride)
        ) {
            if (attemptsRemaining <= 0) {
                options.view.hideBackdrop();
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
                    options.view.hideBackdrop();
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
            options.view.hideBackdrop();
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
        options.view.hideBackdrop();
    }

    function setSkipButton(payload: OverlaySkipButtonPayload): void {
        const nextLabel = payload?.label || "";
        if (skipLabel === nextLabel) {
            return;
        }
        skipLabel = nextLabel;
        options.view.setSkipButton(skipLabel);
    }

    return {
        requestSkip: options.onSkipRequested,
        setBackdrops,
        setSkipButton
    };
}

function arraysEqual(left: string[], right: string[]): boolean {
    return left.length === right.length && left.every((value, index) => value === right[index]);
}

function resolvePlaylistIndex(currentIndex: number, playlistLength: number, advance: boolean): number {
    if (playlistLength <= 0 || currentIndex < 0) {
        return 0;
    }
    return advance ? (currentIndex + 1) % playlistLength : currentIndex;
}
