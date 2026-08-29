import type { JellyfinBaseItem } from "../../jellyfin/types";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface SidebarRequestPort {
    requestJson<T>(method: HttpMethod, endpoint: string, data?: unknown): Promise<T | null>;
    fetchItemDetails(itemId: string): Promise<JellyfinBaseItem | null>;
}
