import type { JellyfinBaseItem } from "../jellyfin/types";

import { MESSAGE_NAMES } from "../jellyfin/messages";
import { state } from "./store";

const HOVER_DELAY_MS = 200;
const HOVER_LINGER_MS = 1250;

let playlistItemIds: string[] = [];
let overrideItemId = "";
let overridesAllowed = false;
let hoveredCard: HTMLElement | null = null;
let focusedCard: HTMLElement | null = null;
let overrideTimer: ReturnType<typeof setTimeout> | null = null;

export function buildBackdropItemIds(
    items: JellyfinBaseItem[],
    random: () => number = Math.random
): string[] {
    const uniqueIds = Array.from(new Set(items.map(resolveBackdropItemId).filter(Boolean)));
    for (let index = uniqueIds.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(random() * (index + 1));
        [uniqueIds[index], uniqueIds[swapIndex]] = [uniqueIds[swapIndex], uniqueIds[index]];
    }
    return uniqueIds;
}

export function setBackdropSlideshow(items: JellyfinBaseItem[]): void {
    resetInteractionState();
    playlistItemIds = buildBackdropItemIds(items);
    overridesAllowed = true;
    publishBackdropContext();
}

export function setBackdropDetail(item: JellyfinBaseItem): void {
    resetInteractionState();
    const itemId = resolveBackdropItemId(item);
    playlistItemIds = itemId ? [itemId] : [];
    overridesAllowed = false;
    publishBackdropContext();
}

export function setHoveredBackdropCard(card: HTMLElement | null): void {
    hoveredCard = card;
    updateBackdropOverride();
}

export function setFocusedBackdropCard(card: HTMLElement | null): void {
    focusedCard = card;
    updateBackdropOverride();
}

export function clearBackdropContext(): void {
    resetInteractionState();
    playlistItemIds = [];
    overridesAllowed = false;
    publishBackdropContext();
}

function resolveBackdropItemId(item: JellyfinBaseItem): string {
    if (item.Type === "Episode" || item.Type === "Season") {
        return item.SeriesId || item.Id || "";
    }
    return item.Id || "";
}

function resolveCardBackdropItemId(card: HTMLElement): string {
    const type = card.dataset.type || "";
    if (type === "Episode" || type === "Season") {
        return card.dataset.seriesId || card.dataset.id || "";
    }
    return card.dataset.id || "";
}

function updateBackdropOverride(): void {
    clearOverrideTimer();
    const targetCard = overridesAllowed ? hoveredCard || focusedCard : null;
    const nextItemId = targetCard ? resolveCardBackdropItemId(targetCard) : "";
    if (!state.backdropPreviewsEnabled) {
        clearBackdropOverride();
        return;
    }
    if (!nextItemId) {
        scheduleBackdropOverrideClear();
        return;
    }
    if (overrideItemId === nextItemId) {
        return;
    }

    overrideTimer = setTimeout(() => {
        overrideTimer = null;
        const currentTarget = hoveredCard || focusedCard;
        if (!overridesAllowed || currentTarget !== targetCard) {
            return;
        }
        overrideItemId = nextItemId;
        publishBackdropContext();
    }, HOVER_DELAY_MS);
}

function scheduleBackdropOverrideClear(): void {
    if (!overrideItemId) {
        return;
    }
    overrideTimer = setTimeout(() => {
        overrideTimer = null;
        if (overridesAllowed && (hoveredCard || focusedCard)) {
            return;
        }
        clearBackdropOverride();
    }, HOVER_LINGER_MS);
}

function clearBackdropOverride(): void {
    if (!overrideItemId) {
        return;
    }
    overrideItemId = "";
    publishBackdropContext();
}

function resetInteractionState(): void {
    clearOverrideTimer();
    hoveredCard = null;
    focusedCard = null;
    overrideItemId = "";
}

function clearOverrideTimer(): void {
    if (!overrideTimer) {
        return;
    }
    clearTimeout(overrideTimer);
    overrideTimer = null;
}

function publishBackdropContext(): void {
    iina.postMessage(MESSAGE_NAMES.BackdropContext, {
        itemIds: playlistItemIds,
        overrideItemId
    });
}
