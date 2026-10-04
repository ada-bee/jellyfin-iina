import { expect, test } from "bun:test";

test("search filters cannot revive rows after empty, pending, failed or cleared searches", () => {
    // Isolate browser module mocks from other tests.
    const result = Bun.spawnSync([process.execPath, "-"], {
        cwd: new URL("../../../", import.meta.url).pathname,
        stdin: Buffer.from(`
            import { mock, expect } from "bun:test";
            const base = process.cwd() + "/src/";
            let rendered = "";
            let backdropIds = [];
            function node() {
                return { dataset: {}, append() {}, appendChild() {}, setAttribute() {} };
            }
            globalThis.document = { createElement: node, createElementNS: node };
            globalThis.window = { scrollTo() {} };
            mock.module(base + "sidebar/dom.ts", () => ({
                ui: { searchFilters: { querySelectorAll: () => [] } }
            }));
            mock.module(base + "sidebar/backdropContext.ts", () => ({
                setBackdropSlideshow: items => { backdropIds = items.map(item => item.Id); }
            }));
            mock.module(base + "sidebar/views/cards.ts", () => ({
                buildListCardElement: node, getSearchCardOptions: () => ({})
            }));
            mock.module(base + "sidebar/views/content.ts", () => ({
                replaceContent: () => { rendered = "results"; }
            }));
            mock.module(base + "sidebar/views/chrome.ts", () => ({
                renderEmptyState: () => { rendered = "empty"; }
            }));
            const searchView = await import(base + "sidebar/views/search.ts");
            const unusedViews = [
                "appendLibraryGridItems", "renderEmptyState", "renderEpisodeDetails",
                "renderHomeSections", "renderLibraryGrid", "renderMovieDetails",
                "renderSeriesDetails", "renderSeriesSeasons", "showLibraryGridLoadError",
                "updateTitle", "hideLoading"
            ];
            mock.module(base + "sidebar/views/index.ts", () => ({
                ...Object.fromEntries(unusedViews.map(name => [name, () => {}])),
                ...searchView,
                showLoading: () => { rendered = "loading"; },
                showError: () => { rendered = "error"; }
            }));
            const pending = new Map();
            mock.module(base + "adapters/browser/sidebarRequests.ts", () => ({
                sidebarRequests: { search: { search: (_userId, query) =>
                    new Promise((resolve, reject) => pending.set(query, { resolve, reject }))
                } }
            }));
            const { state } = await import(base + "sidebar/store.ts");
            const { performSearch, clearSidebarRequestCaches } =
                await import(base + "sidebar/controllers/loaders.ts");
            function search(query) {
                state.searchQuery = query;
                return performSearch(query);
            }
            const first = search("first");
            pending.get("first").resolve([{ Id: "movie", Type: "Movie" }]);
            await first;
            expect(backdropIds).toEqual(["movie"]);

            const empty = search("empty");
            searchView.setSearchFilter("movie");
            expect(rendered).toBe("loading");
            pending.get("empty").resolve([]);
            await empty;
            searchView.setSearchFilter("all");
            expect(rendered).toBe("empty");
            expect(backdropIds).toEqual([]);

            const stale = search("stale");
            const latest = search("latest");
            pending.get("latest").resolve([{ Id: "latest", Type: "Movie" }]);
            await latest;
            pending.get("stale").resolve([{ Id: "stale", Type: "Movie" }]);
            await stale;
            searchView.setSearchFilter("movie");
            expect(backdropIds).toEqual(["latest"]);

            clearSidebarRequestCaches();
            rendered = "cleared";
            searchView.setSearchFilter("all");
            expect(rendered).toBe("cleared");

            const failed = search("failed");
            pending.get("failed").reject(new Error("offline"));
            await failed;
            searchView.setSearchFilter("movie");
            expect(rendered).toBe("error");
        `),
        stdout: "pipe",
        stderr: "pipe"
    });
    expect(result.stderr.toString()).toBe("");
    expect(result.exitCode).toBe(0);
});
