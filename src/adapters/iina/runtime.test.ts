import { expect, test } from "bun:test";

test("loading and reloading the sidebar preserves its Keychain message bridge", () => {
    // Isolate the native runtime's global iina object and module mocks.
    const result = Bun.spawnSync([process.execPath, "-"], {
        cwd: new URL("../../../", import.meta.url).pathname,
        stdin: Buffer.from(`
            import { mock, expect } from "bun:test";
            const base = process.cwd() + "/src/";
            const events = new Map();
            const handlers = new Map();
            const keychain = new Map();
            const responses = [];
            const loadedFiles = [];
            mock.module(base + "adapters/iina/mediaOverlay.ts", () => Object.fromEntries([
                "clearBackdropContext", "initializeMediaOverlay", "loadMediaOverlay",
                "refreshMediaOverlay", "setBackdropContext", "setBackdropPresentation", "setSidebarWidth"
            ].map(name => [name, () => {}])));
            mock.module(base + "adapters/iina/playbackRuntime.ts", () => ({
                initializePlaybackHandlers: () => ({
                    openLibrary: () => false, play() {}, queue() {}, onAuthCleared() {}
                })
            }));
            globalThis.iina = {
                core: { window: { loaded: true, sidebar: null } },
                event: { on: (name, handler) => events.set(name, handler) },
                menu: { item: () => ({}), addItem() {} },
                mpv: { getFlag: () => false, getString: () => "" },
                preferences: { get: () => undefined },
                sidebar: {
                    loadFile: path => {
                        loadedFiles.push(path);
                        // IINA 1.5 removes every previous webview message handler here.
                        handlers.clear();
                    },
                    onMessage: (name, handler) => handlers.set(name, handler),
                    postMessage: (name, payload) => responses.push({ name, payload }),
                    show() {}, hide() {}
                },
                utils: {
                    keychainRead: (service, name) => keychain.get(service + "/" + name) ?? false,
                    keychainWrite: (service, name, value) => {
                        keychain.set(service + "/" + name, value);
                        return true;
                    }
                }
            };
            await import(base + "adapters/iina/runtime.ts");
            let savedSession = null;
            function request(payload, expected) {
                const handler = handlers.get("credentialRequest");
                expect(typeof handler).toBe("function");
                const previousResponses = responses.length;
                handler(payload);
                expect(responses.length).toBe(previousResponses + 1);
                expect(responses.at(-1)).toEqual({ name: "credentialResponse", payload: expected });
            }
            try {
                for (const load of [1, 2]) {
                    events.get("iina.window-loaded")();
                    request({ requestId: "load-" + load, operation: "load" }, {
                        requestId: "load-" + load, ok: true, session: savedSession
                    });
                    savedSession = {
                        serverUrl: "https://media.example.test", serverName: "Media",
                        accessToken: "token-" + load, userId: "user-id", username: "Adela"
                    };
                    request({ requestId: "save-" + load, operation: "save", session: savedSession }, {
                        requestId: "save-" + load, ok: true, session: null
                    });
                    expect(JSON.parse(keychain.get("jellyfin-session/default"))).toEqual(savedSession);
                }
                expect(loadedFiles).toEqual(["ui/sidebar.html", "ui/sidebar.html"]);
            } finally {
                events.get("iina.window-will-close")();
            }
        `),
        stdout: "pipe",
        stderr: "pipe"
    });
    expect(result.stderr.toString()).toBe("");
    expect(result.exitCode).toBe(0);
});
