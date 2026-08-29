import type { JellyfinBaseItem } from "../jellyfin/types";

import {
    beginSearch,
    clearSearch,
    createRouterState,
    getBreadcrumbs,
    getCurrentRoute,
    getSearchOrigin,
    navigateBack,
    navigateHome,
    navigateLibrary,
    navigateToDetails,
    updateSearch,
    type BreadcrumbEntry as RouteBreadcrumbEntry,
    type RouterState,
    type SearchFilter,
    type SidebarRoute
} from "./router";

export type { SearchFilter } from "./router";
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
    | { type: "movie"; id: string; name: string }
    | { type: "series"; id: string; name: string };

export type RetryOperation =
    | { kind: "home"; forceReload: true }
    | {
        kind: "library";
        id: string;
        name: string;
        collectionType: string;
    }
    | { kind: "movie"; id: string; name: string }
    | { kind: "series"; id: string; name: string }
    | { kind: "search"; query: string };

export interface SidebarState {
    router: RouterState;
    retryOperation: RetryOperation | null;
    breadcrumb: BreadcrumbEntry[];
    serverUrl: string;
    serverName: string;
    accessToken: string;
    userId: string;
    deviceId: string;
    username: string;
    backdropPreviewsEnabled: boolean;
    preferEpisodeImagesInNextUp: boolean;
    searchQuery: string;
    searchFilter: SearchFilter;
    searchOrigin: SearchOrigin | null;
    currentLibrary: LibraryState | null;
    currentSeries: SeriesState | null;
}

type Listener = (state: SidebarState) => void;

export function createInitialSidebarState(): SidebarState {
    return {
        router: createRouterState(),
        retryOperation: null,
        breadcrumb: [],
        serverUrl: "",
        serverName: "",
        accessToken: "",
        userId: "",
        deviceId: "",
        username: "",
        backdropPreviewsEnabled: true,
        preferEpisodeImagesInNextUp: false,
        searchQuery: "",
        searchFilter: "all",
        searchOrigin: null,
        currentLibrary: null,
        currentSeries: null
    };
}

function toLegacyBreadcrumb(entry: RouteBreadcrumbEntry): BreadcrumbEntry {
    if (entry.kind === "library") {
        return {
            type: "library",
            id: entry.id,
            name: entry.name,
            collectionType: entry.collectionType
        };
    }
    return { type: entry.kind, id: entry.id, name: entry.name };
}

export class SidebarStore {
    readonly state: SidebarState;
    private readonly listeners = new Set<Listener>();

    constructor(initialState: SidebarState = createInitialSidebarState()) {
        this.state = initialState;
    }

    subscribe(listener: Listener): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    patch(update: Partial<SidebarState>): void {
        Object.assign(this.state, update);
        this.emit();
    }

    setRetryOperation(operation: RetryOperation | null): void {
        this.state.retryOperation = operation;
        this.emit();
    }

    navigateHome(): void {
        this.setRouter(navigateHome());
    }

    navigateLibrary(id: string, name: string, collectionType: string): void {
        this.setRouter(navigateLibrary({ id, name, collectionType }));
    }

    navigateToDetails(route: Extract<SidebarRoute, { kind: "movie" | "series" }>): void {
        this.setRouter(navigateToDetails(this.state.router, route));
    }

    beginSearch(query: string, filter: SearchFilter): void {
        this.setRouter(beginSearch(this.state.router, query, filter));
    }

    updateSearch(query: string): void {
        const current = getCurrentRoute(this.state.router);
        if (current.kind === "search") {
            this.setRouter(updateSearch(this.state.router, { query }));
            return;
        }
        this.state.searchQuery = query;
        this.emit();
    }

    setSearchFilter(filter: SearchFilter): void {
        const current = getCurrentRoute(this.state.router);
        this.setRouter(current.kind === "search"
            ? updateSearch(this.state.router, { filter })
            : this.state.router);
        this.state.searchFilter = filter;
        this.emit();
    }

    clearSearch(): void {
        this.setRouter(clearSearch(this.state.router));
    }

    back(): SidebarRoute {
        this.setRouter(navigateBack(this.state.router));
        return getCurrentRoute(this.state.router);
    }

    private setRouter(router: RouterState): void {
        this.state.router = router;
        this.state.breadcrumb = getBreadcrumbs(router).map(toLegacyBreadcrumb);
        const current = getCurrentRoute(router);
        this.state.searchQuery = current.kind === "search" ? current.query : "";
        this.state.searchFilter = current.kind === "search" ? current.filter : "all";
        this.state.searchOrigin = getSearchOrigin(router);
        this.emit();
    }

    private emit(): void {
        this.listeners.forEach(listener => listener(this.state));
    }
}

export const sidebarStore = new SidebarStore();
export const state = sidebarStore.state;
