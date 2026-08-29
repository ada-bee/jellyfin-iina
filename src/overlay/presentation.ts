import type { BackdropMode } from "./eligibility";

export interface BackdropSources {
    itemIds: string[];
    overrideItemId: string;
}

export function resolveBackdropSources(
    mode: BackdropMode,
    activeItemId: string,
    browseItemIds: string[],
    browseOverrideItemId: string
): BackdropSources {
    if (mode === "paused") {
        return {
            itemIds: activeItemId ? [activeItemId] : [],
            overrideItemId: ""
        };
    }
    if (mode === "browse") {
        return {
            itemIds: browseItemIds,
            overrideItemId: browseOverrideItemId
        };
    }
    return { itemIds: [], overrideItemId: "" };
}
