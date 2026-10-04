import { expect, test } from "bun:test";

function runSessionScenario(scenario: string): void {
    // Each subprocess keeps browser module mocks isolated from other tests.
    const result = Bun.spawnSync([process.execPath, "-"], {
        cwd: new URL("../../../", import.meta.url).pathname,
        stdin: Buffer.from(`
            import { mock, expect } from "bun:test";
            const base = process.cwd() + "/src/";
            const { InvalidSessionIdentityError } = await import(base + "adapters/browser/sessionApi.ts");
            const saved = {
                serverUrl: "https://media.example.test", serverName: "Media",
                accessToken: "saved-token", userId: "saved-user", username: "Saved"
            };
            const messages = [];
            const writes = [];
            const clearedSessions = [];
            let cleared = 0;
            let invalidated = 0;
            let cancelled = 0;
            let browsing = 0;
            let loginShown = 0;
            let navigated = 0;
            let authenticate = async (_url, username) => ({
                AccessToken: username + "-token", User: { Id: username + "-id", Name: username }
            });
            let validate = async session => session;
            let load = async () => saved;
            let save = async session => { writes.push(session); };
            const ui = {
                loginError: { textContent: "" },
                serverUrlInput: { value: saved.serverUrl },
                usernameInput: { value: "New" },
                passwordInput: { value: "password" },
                connectBtn: { disabled: false, textContent: "Connect" }
            };
            mock.module(base + "adapters/browser/sidebarApi.ts", () => ({
                authenticateUser: (...args) => authenticate(...args),
                invalidateAuthenticationRequests: () => { invalidated++; }
            }));
            mock.module(base + "adapters/browser/sessionApi.ts", () => ({
                InvalidSessionIdentityError,
                validateStoredSession: session => validate(session),
                fetchSessionServerName: async () => "Media"
            }));
            mock.module(base + "adapters/browser/storage.ts", () => ({
                loadSessionFromStorage: () => load(),
                saveSessionToStorage: session => save(session),
                clearSessionFromStorage: async session => { cleared++; clearedSessions.push(session); }
            }));
            mock.module(base + "sidebar/dom.ts", () => ({ ui }));
            mock.module(base + "sidebar/backdropContext.ts", () => ({ clearBackdropContext() {} }));
            mock.module(base + "sidebar/views/index.ts", () => ({
                showBrowseView: () => { browsing++; },
                showLoginView: () => { loginShown++; }
            }));
            mock.module(base + "sidebar/controllers/navigation.ts", () => ({
                goHomeFresh: () => { navigated++; }, resetSearchState() {}
            }));
            mock.module(base + "sidebar/controllers/loaders.ts", () => ({ clearSidebarRequestCaches() {} }));
            mock.module(base + "sidebar/playback.ts", () => ({
                cancelPendingPlaybackRequests: () => { cancelled++; }
            }));
            globalThis.iina = { postMessage: (name, data) => messages.push({ name, data }) };
            const { state } = await import(base + "sidebar/store.ts");
            const { JellyfinApiError } = await import(base + "jellyfin/apiError.ts");
            const { restoreSessionFromStorage, handleLogin } = await import(base + "sidebar/controllers/session.ts");
            const event = { preventDefault() {} };
            function deferred() {
                let resolve;
                const promise = new Promise(done => { resolve = done; });
                return { promise, resolve };
            }
            function loginAs(username) {
                ui.usernameInput.value = username;
                ui.passwordInput.value = "password";
                return handleLogin(event);
            }
            function authUpdates() { return messages.filter(message => message.name === "authUpdated"); }
            ${scenario}
        `),
        stdout: "pipe",
        stderr: "pipe"
    });
    expect(result.stderr.toString()).toBe("");
    expect(result.exitCode).toBe(0);
}

test.each([
    ["network failure", "new Error('Network unavailable')"],
    ["403 response", "new JellyfinApiError(403, '/Users/Me')"]
])("a %s preserves the saved login so browsing can retry", (_name, error) => {
    runSessionScenario(`
        validate = async () => { throw ${error}; };
        expect(await restoreSessionFromStorage()).toBe(true);
        expect(cleared).toBe(0);
        expect(writes).toEqual([]);
        expect(state.accessToken).toBe(saved.accessToken);
        expect(authUpdates().map(message => message.data.accessToken)).toEqual([saved.accessToken]);
        expect(browsing).toBe(1);
        expect(loginShown).toBe(0);
    `);
});

test("a failed Keychain load stays inactive and shows a usable login error", () => {
    runSessionScenario(`
        load = async () => { throw new Error("Keychain access denied"); };
        expect(await restoreSessionFromStorage()).toBe(false);
        expect(cleared).toBe(0);
        expect(writes).toEqual([]);
        expect(state.accessToken).toBe("");
        expect(authUpdates()).toEqual([]);
        expect(browsing).toBe(0);
        expect(loginShown).toBe(1);
        expect(ui.loginError.textContent).toContain("Keychain");
        expect(ui.connectBtn.disabled).toBe(false);
    `);
});

test("an invalid restored identity stays inactive without deleting saved credentials", () => {
    runSessionScenario(`
        Object.assign(state, saved);
        validate = async () => { throw new InvalidSessionIdentityError(); };
        expect(await restoreSessionFromStorage()).toBe(false);
        expect(cleared).toBe(0);
        expect(writes).toEqual([]);
        expect(state.accessToken).toBe("");
        expect(authUpdates()).toEqual([]);
        expect(browsing).toBe(0);
        expect(loginShown).toBe(1);
        expect(ui.loginError.textContent).toContain("Sign in again");
        expect(messages.some(message => message.name === "authCleared")).toBe(true);
    `);
});

test("a confirmed 401 removes expired credentials and invalidates pending work", () => {
    runSessionScenario(`
        validate = async () => { throw new JellyfinApiError(401, "/Users/Me"); };
        expect(await restoreSessionFromStorage()).toBe(false);
        expect(cleared).toBe(1);
        expect(clearedSessions).toEqual([saved]);
        expect(invalidated).toBeGreaterThan(1);
        expect(cancelled).toBeGreaterThan(1);
        expect(state.accessToken).toBe("");
        expect(authUpdates()).toEqual([]);
        expect(messages.some(message => message.name === "authCleared")).toBe(true);
        expect(ui.loginError.textContent).toContain("expired");
    `);
});

test("a delayed restore cannot replace a newer login", () => {
    runSessionScenario(`
        const pending = deferred();
        const started = deferred();
        validate = () => { started.resolve(); return pending.promise; };
        const restoring = restoreSessionFromStorage();
        await started.promise;
        await loginAs("New");
        pending.resolve(saved);
        expect(await restoring).toBe(false);
        expect(state.accessToken).toBe("New-token");
        expect(writes.map(session => session.username)).toEqual(["New"]);
        expect(authUpdates().map(message => message.data.accessToken)).toEqual(["New-token"]);
        expect(browsing).toBe(1);
        expect(navigated).toBe(1);
    `);
});

test("a late login response cannot override a newer login", () => {
    runSessionScenario(`
        const pending = deferred();
        const originalAuthenticate = authenticate;
        authenticate = (url, username) => username === "Old" ? pending.promise : originalAuthenticate(url, username);
        const oldLogin = loginAs("Old");
        await loginAs("New");
        pending.resolve({ AccessToken: "Old-token", User: { Id: "Old-id", Name: "Old" } });
        await oldLogin;
        expect(state.accessToken).toBe("New-token");
        expect(writes.map(session => session.username)).toEqual(["New"]);
        expect(authUpdates().map(message => message.data.accessToken)).toEqual(["New-token"]);
        expect(browsing).toBe(1);
        expect(ui.connectBtn.disabled).toBe(false);
    `);
});

test("a failed Keychain save leaves the login inactive and recoverable", () => {
    runSessionScenario(`
        save = async () => { throw new Error("Keychain access denied"); };
        await loginAs("New");
        expect(state.accessToken).toBe("");
        expect(authUpdates()).toEqual([]);
        expect(browsing).toBe(0);
        expect(navigated).toBe(0);
        expect(ui.loginError.textContent).toBe("Keychain access denied");
        expect(ui.connectBtn.disabled).toBe(false);
    `);
});
