import { MESSAGE_NAMES } from "../shared/messages";
import { initSidebar } from "./controller/bootstrap";

document.addEventListener("visibilitychange", () => {
    iina.postMessage(MESSAGE_NAMES.SidebarVisibilityChanged, {
        visible: !document.hidden
    });
});

initSidebar();
