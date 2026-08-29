export type ActionHandler = () => void | Promise<void>;

export interface LibraryState {
    id: string;
    name: string;
    type: string;
}

export interface SeriesState {
    id: string;
    name: string;
}

export interface SeasonState {
    id: string;
    name: string;
}

export type BreadcrumbEntry =
    | {
        type: "library";
        id: string;
        name: string;
        collectionType: string;
    }
    | {
        type: "series";
        id: string;
        name: string;
    }
    | {
        type: "season";
        id: string;
        seriesId: string;
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
    backdropPreviewsEnabled: boolean;
    preferEpisodeImagesInNextUp: boolean;
    searchQuery: string;
    currentLibrary: LibraryState | null;
    currentSeries: SeriesState | null;
    currentSeason: SeasonState | null;
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
    backdropPreviewsEnabled: true,
    preferEpisodeImagesInNextUp: false,
    searchQuery: "",
    currentLibrary: null,
    currentSeries: null,
    currentSeason: null,
    lastAction: null
};
