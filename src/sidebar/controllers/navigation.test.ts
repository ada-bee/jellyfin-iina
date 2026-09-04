import { expect, test } from "bun:test";

test("fresh navigation reloads playback data while ordinary navigation uses caches", () => {
    // Isolate DOM and transport module mocks from the rest of the test suite.
    const result = Bun.spawnSync([process.execPath, "-"], {
        cwd: new URL("../../../", import.meta.url).pathname,
        stdin: Buffer.from(`
            import { mock, expect } from "bun:test";
            const base = process.cwd() + "/src/";
            const rendered = new Map();
            const viewNames = [
                "appendLibraryGridItems", "renderEmptyState", "renderEpisodeDetails",
                "renderHomeSections", "renderLibraryGrid", "renderMovieDetails",
                "renderSearchResults", "renderSeriesDetails", "renderSeriesSeasons",
                "showLibraryGridLoadError", "showError", "showLoading", "updateTitle", "hideLoading"
            ];
            mock.module(base + "sidebar/views/index.ts", () => Object.fromEntries(
                viewNames.map(name => [name, (...args) => rendered.set(name, args)])
            ));
            const node = {
                value: "",
                classList: { add() {}, toggle() {} },
                querySelectorAll() { return []; }
            };
            mock.module(base + "sidebar/dom.ts", () => ({
                ui: { searchInput: node, clearSearchButton: node, searchFilters: node }
            }));
            let position = 100;
            let requests = 0;
            function item(id) {
                requests += 1;
                return { Id: id, UserData: { PlaybackPositionTicks: position } };
            }
            mock.module(base + "adapters/browser/sidebarRequests.ts", () => ({
                sidebarRequests: {
                    home: { load: async () => ({
                        continueWatchingItems: [item("next-up")], newestEpisodes: [],
                        recentMovies: [], recentSeries: []
                    }) },
                    library: { loadPage: async () => ({
                        items: [item("movie")], totalItemCount: 1, hasMore: false
                    }) },
                    details: {
                        loadItem: async id => item(id),
                        loadSeries: async () => ({
                            details: { Id: "series" }, seasons: [], playbackItem: item("episode")
                        })
                    }
                }
            }));
            globalThis.window = { scrollTo() {} };
            globalThis.requestAnimationFrame = callback => callback();
            const { state } = await import(base + "sidebar/store.ts");
            state.serverUrl = "https://example.test";
            state.userId = "user";
            const loaders = await import(base + "sidebar/controllers/loaders.ts");
            const { goHomeFresh } = await import(base + "sidebar/controllers/navigation.ts");
            async function browse() {
                await loaders.loadHome();
                await loaders.loadItems("library", "Movies", "movies");
                await loaders.loadMovie("movie", "Movie");
                await loaders.loadEpisode("episode", "Episode");
                await loaders.loadSeriesDetails("series", "Series");
            }
            await browse();
            expect(requests).toBe(5);
            position = 200;
            await browse();
            expect(requests).toBe(5);

            goHomeFresh("refreshSidebar");
            await Promise.resolve();
            await browse();
            expect(requests).toBe(10);
            const refreshed = [
                rendered.get("renderHomeSections")[0][0],
                rendered.get("renderLibraryGrid")[0][0],
                rendered.get("renderMovieDetails")[0],
                rendered.get("renderEpisodeDetails")[0],
                rendered.get("renderSeriesDetails")[4]
            ];
            expect(refreshed.map(item => item.UserData.PlaybackPositionTicks))
                .toEqual([200, 200, 200, 200, 200]);
        `),
        stdout: "pipe",
        stderr: "pipe"
    });
    expect(result.stderr.toString()).toBe("");
    expect(result.exitCode).toBe(0);
});
