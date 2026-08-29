import type { JellyfinBaseItem } from "../../jellyfin/types";

import { buildLibraryItemsEndpoint } from "../../jellyfin/endpoints";
import type { SidebarRequestPort } from "./port";

export interface LibraryPageRequest {
    userId: string;
    libraryId: string;
    collectionType: string;
    startIndex: number;
    limit: number;
}

export interface LibraryPage {
    items: JellyfinBaseItem[];
    totalItemCount: number;
    hasMore: boolean;
}

export interface LibraryRequests {
    loadPage(request: LibraryPageRequest): Promise<LibraryPage>;
}

export function createLibraryRequests(port: SidebarRequestPort): LibraryRequests {
    return {
        async loadPage(request: LibraryPageRequest): Promise<LibraryPage> {
            const endpoint = buildLibraryItemsEndpoint(
                request.userId,
                request.libraryId,
                request.collectionType,
                request.startIndex,
                request.limit
            );
            const data = await port.requestJson<{
                Items?: JellyfinBaseItem[];
                TotalRecordCount?: number;
            }>("GET", endpoint);
            const items = data?.Items || [];
            const totalItemCount = data?.TotalRecordCount ?? request.startIndex + items.length;
            const hasMore = data?.TotalRecordCount === undefined
                ? items.length === request.limit
                : request.startIndex + items.length < totalItemCount;
            return { items, totalItemCount, hasMore };
        }
    };
}
