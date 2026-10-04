import { describe, expect, test } from "bun:test";

import type { StoredSession } from "../../jellyfin/credentials";
import { handleCredentialRequest, type KeychainStore } from "./credentials";

const SESSION: StoredSession = {
    serverUrl: "https://media.example.test",
    serverName: "Media",
    accessToken: "test-secret-token",
    userId: "user-id",
    username: "Adela"
};

function createKeychain(initialValue: string | false = false) {
    let value = initialValue;
    const writes: Array<{ service: string; name: string; password: string }> = [];
    const keychain: KeychainStore = {
        keychainRead: (service, name) => {
            expect({ service, name }).toEqual({ service: "jellyfin-session", name: "default" });
            return value;
        },
        keychainWrite: (service, name, password) => {
            writes.push({ service, name, password });
            value = password;
            return true;
        }
    };
    return { keychain, writes };
}

describe("IINA credential storage", () => {
    test("saves a session and restores it using IINA's lowercase Keychain API", () => {
        const { keychain, writes } = createKeychain();

        expect(handleCredentialRequest({ requestId: "save", operation: "save", session: SESSION }, keychain))
            .toEqual({ requestId: "save", ok: true, session: null });
        expect(writes).toEqual([{
            service: "jellyfin-session",
            name: "default",
            password: JSON.stringify(SESSION)
        }]);
        expect(handleCredentialRequest({ requestId: "load", operation: "load" }, keychain))
            .toEqual({ requestId: "load", ok: true, session: SESSION });
    });

    test("clears a saved session by overwriting its Keychain value", () => {
        const { keychain, writes } = createKeychain(JSON.stringify(SESSION));

        expect(handleCredentialRequest({ requestId: "clear", operation: "clear", session: SESSION }, keychain))
            .toEqual({ requestId: "clear", ok: true, session: null });
        expect(writes).toEqual([{ service: "jellyfin-session", name: "default", password: "" }]);
        expect(handleCredentialRequest({ requestId: "load", operation: "load" }, keychain))
            .toEqual({ requestId: "load", ok: true, session: null });
    });

    test("clears migrated credentials after the restored server URL was normalized", () => {
        const legacy = { ...SESSION, serverUrl: `${SESSION.serverUrl}/` };
        const { keychain, writes } = createKeychain(JSON.stringify(legacy));
        expect(handleCredentialRequest({ requestId: "clear", operation: "clear", session: SESSION }, keychain).ok)
            .toBe(true);
        expect(writes).toEqual([{ service: "jellyfin-session", name: "default", password: "" }]);
    });

    test.each([
        { ...SESSION, accessToken: "new-token" },
        { ...SESSION, userId: "new-user" },
        { ...SESSION, serverUrl: "https://another.example.test" }
    ])("an expired session cannot clear newer saved credentials", (current) => {
        const { keychain, writes } = createKeychain(JSON.stringify(current));

        expect(handleCredentialRequest({ requestId: "clear", operation: "clear", session: SESSION }, keychain))
            .toEqual({ requestId: "clear", ok: true, session: null });
        expect(writes).toEqual([]);
        expect(handleCredentialRequest({ requestId: "load", operation: "load" }, keychain))
            .toEqual({ requestId: "load", ok: true, session: current });
    });

    test("clearing an already cleared entry succeeds without writing", () => {
        const { keychain, writes } = createKeychain("");

        expect(handleCredentialRequest({ requestId: "clear", operation: "clear", session: SESSION }, keychain))
            .toEqual({ requestId: "clear", ok: true, session: null });
        expect(writes).toEqual([]);
    });

    test("an unreadable Keychain entry cannot be safely cleared", () => {
        const { keychain, writes } = createKeychain();

        expect(handleCredentialRequest({ requestId: "clear", operation: "clear", session: SESSION }, keychain).ok)
            .toBe(false);
        expect(writes).toEqual([]);
    });

    test("treats an unavailable Keychain entry as no saved session", () => {
        expect(handleCredentialRequest({ requestId: "load", operation: "load" }, createKeychain().keychain))
            .toEqual({ requestId: "load", ok: true, session: null });
    });

    test.each([
        "test-secret-token: malformed JSON",
        JSON.stringify({ accessToken: SESSION.accessToken })
    ])("rejects corrupt saved credentials without returning their content", (value) => {
        const response = handleCredentialRequest(
            { requestId: "load", operation: "load" }, createKeychain(value).keychain
        );

        expect(response).toEqual({
            requestId: "load", ok: false, error: "Unable to access saved Jellyfin credentials."
        });
        expect(JSON.stringify(response)).not.toContain(SESSION.accessToken);
    });

    test("does not overwrite saved credentials with an invalid session", () => {
        const { keychain, writes } = createKeychain(JSON.stringify(SESSION));
        const response = handleCredentialRequest({
            requestId: "save", operation: "save", session: { ...SESSION, accessToken: "" }
        }, keychain);

        expect(response.ok).toBe(false);
        expect(writes).toEqual([]);
    });

    test.each(["save", "clear"] as const)("reports a failed %s operation", (operation) => {
        const { keychain } = createKeychain(JSON.stringify(SESSION));
        keychain.keychainWrite = () => false;

        expect(handleCredentialRequest({ requestId: "write", operation, session: SESSION }, keychain))
            .toEqual({ requestId: "write", ok: false, error: "Unable to access saved Jellyfin credentials." });
    });

    test.each(["load", "save", "clear"] as const)("sanitizes exceptions from %s operations", (operation) => {
        const fail = () => { throw new Error(SESSION.accessToken); };
        const keychain: KeychainStore = { keychainRead: fail, keychainWrite: fail };

        expect(handleCredentialRequest({ requestId: "request", operation, session: SESSION }, keychain))
            .toEqual({ requestId: "request", ok: false, error: "Unable to access saved Jellyfin credentials." });
    });
});
