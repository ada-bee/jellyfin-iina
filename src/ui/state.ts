import type { JellyfinBaseItem } from "../shared/jellyfin";

export type ActionHandler = () => void | Promise<void>;
export type SearchFilter = "all" | "movie" | "series" | "episode";
export type SearchOrigin = "home" | "library";

export interface LibraryState {
    id: string;
    name: string;
    type: string;
    items: JellyfinBaseItem[];
    totalItemCount: number;
    hasMore: boolean;
    isLoadingMore: boolean;
    scrollTop: number;
}

export interface SeriesState {
    id: string;
    name: string;
    selectedSeasonId: string;
}

export type BreadcrumbEntry =
    | {
        type: "library";
        id: string;
        name: string;
        collectionType: string;
    }
    | {
        type: "movie";
        id: string;
        name: string;
    }
    | {
        type: "series";
        id: string;
        name: string;
    };

export interface SidebarState {
    breadcrumb: BreadcrumbEntry[];
    serverUrl: string;
    serverName: string;
    accessToken: string;
    userId: string;
    deviceId: string;
    username: string;
    preferEpisodeImagesInNextUp: boolean;
    searchQuery: string;
    searchFilter: SearchFilter;
    searchOrigin: SearchOrigin | null;
    currentLibrary: LibraryState | null;
    currentSeries: SeriesState | null;
    lastAction: ActionHandler | null;
}

export const state: SidebarState = {
    breadcrumb: [],
    serverUrl: "",
    serverName: "",
    accessToken: "",
    userId: "",
    deviceId: "",
    username: "",
    preferEpisodeImagesInNextUp: false,
    searchQuery: "",
    searchFilter: "all",
    searchOrigin: null,
    currentLibrary: null,
    currentSeries: null,
    lastAction: null
};
