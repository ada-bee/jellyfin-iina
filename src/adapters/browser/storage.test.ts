import { describe, expect, test } from "bun:test";
import { createSessionStorage } from "./storage";
import type { SessionCredentials } from "./credentials";
import type { StoredSession } from "../../jellyfin/credentials";

const session: StoredSession = {
    serverUrl: "https://jellyfin.example.test",
    serverName: "Jellyfin",
    accessToken: "test-token",
    userId: "user",
    username: "Adela"
};

function setup(legacy: string | null = JSON.stringify(session)) {
    const local = new Map<string, string>();
    if (legacy !== null) local.set("jellyfin-session", legacy);
    let secure: StoredSession | null = null;
    const credentials: SessionCredentials = {
        load: async () => secure,
        save: async saved => { secure = saved; },
        clear: async () => { secure = null; }
    };
    const storage = createSessionStorage({
        getItem: key => local.get(key) ?? null,
        removeItem: key => { local.delete(key); }
    }, credentials);
    return { local, credentials, storage, saved: () => secure };
}

describe("secure session persistence", () => {
    test("migrates legacy credentials only after Keychain confirms the write", async () => {
        const setupResult = setup();
        let completeWrite!: () => void;
        const write = setupResult.credentials.save;
        setupResult.credentials.save = async saved => {
            await new Promise<void>(resolve => { completeWrite = resolve; });
            await write(saved);
        };
        const loading = setupResult.storage.load();
        await Promise.resolve();
        await Promise.resolve();
        expect(setupResult.local.has("jellyfin-session")).toBe(true);
        completeWrite();
        expect(await loading).toEqual(session);
        expect(setupResult.saved()).toEqual(session);
        expect(setupResult.local.has("jellyfin-session")).toBe(false);
    });

    test("preserves legacy credentials on failed migration and permits a retry", async () => {
        const { storage, local, credentials } = setup();
        const save = credentials.save;
        credentials.save = async () => { throw new Error("Keychain locked"); };
        await expect(storage.load()).rejects.toThrow("Keychain locked");
        expect(local.get("jellyfin-session")).toBe(JSON.stringify(session));
        credentials.save = save;
        expect(await storage.load()).toEqual(session);
        expect(local.size).toBe(0);
    });

    test("leaves unreadable credentials intact and reports a useful error", async () => {
        const { storage, local } = setup("corrupt data");
        await expect(storage.load()).rejects.toThrow("Sign in again");
        expect(local.get("jellyfin-session")).toBe("corrupt data");
    });

    test("new sessions are saved only in Keychain and supersede legacy data", async () => {
        const { storage, local, saved } = setup();
        const updated = { ...session, accessToken: "new-token" };
        await storage.save(updated);
        expect(saved()).toEqual(updated);
        expect(local.size).toBe(0);
        expect(await storage.load()).toEqual(updated);
    });

    test("serializes invalidation after an in-flight migration", async () => {
        const { storage, local, credentials, saved } = setup();
        let finishRead!: () => void;
        credentials.load = () => new Promise(resolve => {
            finishRead = () => resolve(null);
        });
        const loading = storage.load();
        const clearing = storage.clear(session);
        await Promise.resolve();
        finishRead();
        await loading;
        await clearing;
        expect(saved()).toBeNull();
        expect(local.size).toBe(0);
    });

    test("keeps legacy data if secure clearing fails", async () => {
        const { storage, local, credentials } = setup();
        credentials.clear = async () => { throw new Error("Keychain locked"); };
        await expect(storage.clear(session)).rejects.toThrow("Keychain locked");
        expect(local.has("jellyfin-session")).toBe(true);
    });
});
