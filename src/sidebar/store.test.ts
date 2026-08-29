import { describe, expect, test } from "bun:test";

import { SidebarStore, createInitialSidebarState } from "./store";

describe("sidebar store compatibility state", () => {
    test("derives breadcrumbs and search fields from typed routes", () => {
        const store = new SidebarStore(createInitialSidebarState());
        store.navigateLibrary("", "Movies", "movies");
        store.beginSearch("signal", "movie");

        expect(store.state.breadcrumb).toEqual([{
            type: "library",
            id: "",
            name: "Movies",
            collectionType: "movies"
        }]);
        expect(store.state.searchQuery).toBe("signal");
        expect(store.state.searchOrigin).toBe("library");

        store.navigateToDetails({ kind: "movie", id: "movie-1", name: "Signal Fire" });
        expect(store.state.searchQuery).toBe("");
        expect(store.state.breadcrumb.map(entry => entry.type)).toEqual(["library", "movie"]);
    });

    test("stores retry as typed data", () => {
        const store = new SidebarStore(createInitialSidebarState());

        store.setRetryOperation({ kind: "search", query: "station" });

        expect(store.state.retryOperation).toEqual({ kind: "search", query: "station" });
    });
});
