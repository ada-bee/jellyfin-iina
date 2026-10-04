import { expect, test } from "bun:test";

test("session changes isolate old responses and only a current 401 expires authentication", () => {
    const result = Bun.spawnSync([process.execPath, "-"], {
        cwd: new URL("../../../", import.meta.url).pathname,
        stdin: Buffer.from(`
            import { expect } from "bun:test";
            globalThis.localStorage = { getItem: () => "test-device", setItem() {} };
            let complete;
            globalThis.fetch = () => new Promise(resolve => { complete = resolve; });
            const { state } = await import("./src/sidebar/store.ts");
            const api = await import("./src/adapters/browser/sidebarApi.ts");
            let expirations = 0;
            api.setAuthenticationFailureHandler(() => { expirations += 1; });
            Object.assign(state, { serverUrl: "https://example.test", userId: "old-user", accessToken: "old-token" });

            const stale = api.apiRequest("GET", "/Items").catch(error => error);
            Object.assign(state, { userId: "new-user", accessToken: "new-token" });
            complete(new Response("expired", { status: 401 }));
            await stale;
            expect(expirations).toBe(0);

            const sameCredentials = api.apiRequest("GET", "/Items").catch(error => error);
            api.invalidateAuthenticationRequests();
            complete(new Response("expired", { status: 401 }));
            await sameCredentials;
            expect(expirations).toBe(0);

            const current = api.apiRequest("GET", "/Items").catch(error => error);
            complete(new Response("expired", { status: 401 }));
            await current;
            expect(expirations).toBe(1);

            const offline = api.apiRequest("GET", "/Items").catch(error => error);
            complete(new Response("unavailable", { status: 503 }));
            await offline;
            expect(expirations).toBe(1);

            const staleSuccess = api.apiRequest("GET", "/Items").catch(error => error);
            api.invalidateAuthenticationRequests();
            complete(Response.json({ Items: [{ Id: "old-private-item" }] }));
            expect(await staleSuccess).toBeInstanceOf(Error);
        `),
        stdout: "pipe",
        stderr: "pipe"
    });
    expect(result.stderr.toString()).toBe("");
    expect(result.exitCode).toBe(0);
});
