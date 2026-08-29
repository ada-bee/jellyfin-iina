import { createDetailsRequests } from "./details";
import { createHomeRequests } from "./home";
import { createLibraryRequests } from "./library";
import { createSearchRequests } from "./search";
import type { SidebarRequestPort } from "./port";

export function createSidebarRequests(port: SidebarRequestPort) {
    return {
        home: createHomeRequests(port),
        library: createLibraryRequests(port),
        details: createDetailsRequests(port),
        search: createSearchRequests(port)
    };
}

export type SidebarRequests = ReturnType<typeof createSidebarRequests>;
