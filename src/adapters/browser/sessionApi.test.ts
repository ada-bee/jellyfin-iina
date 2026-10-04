import { expect, test } from "bun:test";

test("validates the saved token against Users/Me and rejects another user's response", () => {
    const result = Bun.spawnSync([process.execPath, "-"], {
        cwd: new URL("../../../", import.meta.url).pathname,
        stdin: Buffer.from(`
            import { expect } from "bun:test";
            const session = {
                serverUrl: "https://example.test/jellyfin", serverName: "Jellyfin",
                accessToken: "test-token", userId: "user", username: "old-name"
            };
            globalThis.localStorage = { getItem: () => "test-device" };
            let status = 200;
            let body = { Id: "user", Name: "current-name" };
            let responseText;
            globalThis.fetch = async (url, options) => {
                expect(url).toBe("https://example.test/jellyfin/Users/Me");
                expect(options.headers.Authorization).toContain('Token="test-token"');
                return new Response(responseText ?? JSON.stringify(body), { status });
            };
            const { validateStoredSession, InvalidSessionIdentityError } = await import("./src/adapters/browser/sessionApi.ts");
            const { JellyfinApiError } = await import("./src/jellyfin/apiError.ts");
            expect(await validateStoredSession(session)).toEqual({ ...session, username: "current-name" });
            body = { Id: "another-user", Name: "other-name" };
            await expect(validateStoredSession(session)).rejects.toBeInstanceOf(InvalidSessionIdentityError);
            body = {};
            await expect(validateStoredSession(session)).rejects.toBeInstanceOf(InvalidSessionIdentityError);
            responseText = "<html>Proxy authentication page</html>";
            await expect(validateStoredSession(session)).rejects.toBeInstanceOf(InvalidSessionIdentityError);
            responseText = undefined;
            for (const failureStatus of [401, 403, 503]) {
                status = failureStatus;
                let failure;
                try { await validateStoredSession(session); } catch (error) { failure = error; }
                expect(failure).toBeInstanceOf(JellyfinApiError);
                expect(failure.status).toBe(failureStatus);
            }
        `),
        stdout: "pipe",
        stderr: "pipe"
    });
    expect(result.stderr.toString()).toBe("");
    expect(result.exitCode).toBe(0);
});
