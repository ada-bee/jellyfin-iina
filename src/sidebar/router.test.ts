import { describe, expect, test } from "bun:test";

import {
    beginSearch,
    clearSearch,
    createRouterState,
    getCurrentRoute,
    getSearchOrigin,
    navigateBack,
    navigateLibrary,
    navigateToDetails
} from "./router";

describe("sidebar router", () => {
    test("preserves the collection route behind details and back navigation", () => {
        const library = navigateLibrary({ id: "", name: "Movies", collectionType: "movies" });
        const details = navigateToDetails(library, { kind: "movie", id: "movie-1", name: "Movie" });

        expect(details.stack.map(route => route.kind)).toEqual(["home", "library", "movie"]);
        expect(getCurrentRoute(navigateBack(details))).toEqual({
            kind: "library",
            id: "",
            name: "Movies",
            collectionType: "movies"
        });
    });

    test("search restores its origin and is replaced by selected details", () => {
        const library = navigateLibrary({ id: "", name: "Series", collectionType: "tvshows" });
        const search = beginSearch(library, "station", "series");

        expect(getSearchOrigin(search)).toBe("library");
        expect(clearSearch(search)).toEqual(library);

        const details = navigateToDetails(search, {
            kind: "series",
            id: "series-1",
            name: "North Station"
        });
        expect(details.stack.map(route => route.kind)).toEqual(["home", "library", "series"]);
    });

    test("does not navigate behind home", () => {
        const home = createRouterState();
        expect(navigateBack(home)).toBe(home);
    });
});
