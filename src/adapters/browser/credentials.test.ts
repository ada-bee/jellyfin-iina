import { describe, expect, test } from "bun:test";
import type { CredentialRequest, CredentialResponse } from "../../jellyfin/credentials";
import { createSessionCredentials } from "./credentials";

describe("credential message bridge", () => {
    test("correlates responses and propagates native failure without hanging", async () => {
        let respond!: (response: CredentialResponse) => void;
        const sent: CredentialRequest[] = [];
        const credentials = createSessionCredentials({
            onMessage: (_name, handler) => { respond = handler; },
            postMessage: (_name, payload) => { sent.push(payload); }
        });
        const loading = credentials.load();
        const clearing = credentials.clear({
            serverUrl: "https://example.test", serverName: "Jellyfin",
            accessToken: "test-token", userId: "user", username: "Adela"
        });
        respond({ requestId: "unknown", ok: true, session: null });
        respond({ requestId: sent[1]!.requestId, ok: true, session: null });
        await clearing;
        respond({ requestId: sent[0]!.requestId, ok: false, error: "Unlock Keychain and try again." });
        await expect(loading).rejects.toThrow("Unlock Keychain and try again.");
    });

    test("reports an unavailable native bridge", async () => {
        const credentials = createSessionCredentials({
            onMessage() {},
            postMessage() { throw new Error("unavailable"); }
        });
        await expect(credentials.load()).rejects.toThrow("Could not access IINA's Keychain");
    });

    test("times out unanswered requests so sign-in remains usable", async () => {
        const credentials = createSessionCredentials({ onMessage() {}, postMessage() {} }, 1);
        await expect(credentials.load()).rejects.toThrow("did not respond");
    });
});
