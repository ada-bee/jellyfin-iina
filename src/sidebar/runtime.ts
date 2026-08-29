import { MESSAGE_NAMES } from "../jellyfin/messages";
import { initSidebar } from "./controllers/bootstrap";

export function startSidebar(): void {
    const publishViewport = () => {
        iina.postMessage(MESSAGE_NAMES.SidebarVisibilityChanged, {
            visible: !document.hidden,
            viewportWidth: window.innerWidth
        });
    };

    document.addEventListener("visibilitychange", publishViewport);
    window.addEventListener("resize", publishViewport, { passive: true });
    publishViewport();

    initSidebar();
}
