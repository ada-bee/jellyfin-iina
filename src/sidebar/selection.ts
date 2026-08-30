import type { CardContext } from "./viewModels";

export type CardSelectionAction = "open-series" | "open-movie" | "open-episode";

export function resolveCardSelection(context: CardContext): CardSelectionAction | null {
    if (context.type === "Series") {
        return "open-series";
    }
    if (context.type === "Movie") {
        return "open-movie";
    }
    if (context.type === "Episode") {
        return "open-episode";
    }
    return null;
}
