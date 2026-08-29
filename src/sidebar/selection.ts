import type { CardContext } from "./viewModels";

export type CardSelectionAction = "open-series" | "open-movie" | "play";

export function resolveCardSelection(context: CardContext): CardSelectionAction {
    if (context.type === "Series") {
        return "open-series";
    }
    if (context.type === "Movie" && !context.directPlay) {
        return "open-movie";
    }
    return "play";
}
