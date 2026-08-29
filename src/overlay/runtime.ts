import { MESSAGE_NAMES } from "../jellyfin/messages";

import { createOverlayController, type OverlayScheduler } from "./controller";
import { createOverlayDomView } from "./domView";

export function startOverlay(): void {
    const view = createOverlayDomView(document);
    const scheduler: OverlayScheduler = {
        setTimeout: (callback, delayMs) => window.setTimeout(callback, delayMs),
        clearTimeout: handle => window.clearTimeout(handle as number)
    };
    const controller = createOverlayController({
        view,
        scheduler,
        onSkipRequested: () => iina.postMessage(MESSAGE_NAMES.SkipSegment, {})
    });

    view.onSkipRequested(controller.requestSkip);
    iina.onMessage(MESSAGE_NAMES.OverlayBackdrops, controller.setBackdrops);
    iina.onMessage(MESSAGE_NAMES.OverlaySkipButton, controller.setSkipButton);
}
