import { MESSAGE_NAMES } from "../shared/messages";

import { fetchBackdropTags } from "./api";
import { getCardContext } from "./render";
import { state } from "./state";
import { log } from "./utils";

const HOVER_DELAY_MS = 350;

const backdropCache = new Map<string, Promise<string[]>>();
let hoverTimer: ReturnType<typeof setTimeout> | null = null;
let previewRequestId = 0;

function resolveBackdropItemId(card: HTMLElement): string {
    const details = getCardContext(card);
    if (!details) {
        return "";
    }
    if (details.type === "Episode" || details.type === "Season") {
        return details.context.seriesId || details.id;
    }
    return details.id;
}

function loadBackdropTags(itemId: string): Promise<string[]> {
    const cached = backdropCache.get(itemId);
    if (cached) {
        return cached;
    }

    const request = fetchBackdropTags(itemId).catch((error) => {
        backdropCache.delete(itemId);
        throw error;
    });
    backdropCache.set(itemId, request);
    return request;
}

async function previewCard(card: HTMLElement, requestId: number): Promise<void> {
    const itemId = resolveBackdropItemId(card);
    if (!itemId) {
        return;
    }

    try {
        const backdropTags = await loadBackdropTags(itemId);
        if (requestId !== previewRequestId) {
            return;
        }
        iina.postMessage(MESSAGE_NAMES.PreviewBackdrops, {
            itemId: itemId,
            backdropTags: backdropTags
        });
    } catch (error) {
        if (requestId !== previewRequestId) {
            return;
        }
        log("Failed to load backdrop preview:", error instanceof Error ? error.message : error);
        iina.postMessage(MESSAGE_NAMES.PreviewBackdrops, {
            itemId: itemId,
            backdropTags: []
        });
    }
}

export function scheduleBackdropPreview(card: HTMLElement): void {
    cancelScheduledBackdropPreview();
    if (!state.backdropPreviewsEnabled) {
        return;
    }

    previewRequestId += 1;
    const requestId = previewRequestId;
    hoverTimer = setTimeout(() => {
        hoverTimer = null;
        void previewCard(card, requestId);
    }, HOVER_DELAY_MS);
}

export function cancelScheduledBackdropPreview(): void {
    if (hoverTimer) {
        clearTimeout(hoverTimer);
        hoverTimer = null;
    }
    previewRequestId += 1;
}

export function clearBackdropPreview(): void {
    cancelScheduledBackdropPreview();
    backdropCache.clear();
    iina.postMessage(MESSAGE_NAMES.PreviewBackdrops, {
        itemId: "",
        backdropTags: []
    });
}
