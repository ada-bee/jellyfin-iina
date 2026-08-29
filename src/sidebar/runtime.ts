import { MESSAGE_NAMES } from "../jellyfin/messages";
import { initSidebar } from "./controllers/bootstrap";

export function startSidebar(): void {
    document.addEventListener("visibilitychange", () => {
        iina.postMessage(MESSAGE_NAMES.SidebarVisibilityChanged, {
            visible: !document.hidden
        });
    });

    initSidebar();
}
