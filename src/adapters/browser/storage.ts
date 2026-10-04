import { matchesSession, parseStoredSession, type StoredSession } from "../../jellyfin/credentials";
import { createSessionCredentials, type SessionCredentials } from "./credentials";

const DEVICE_ID_KEY = "jellyfin-device-id";
const SESSION_KEY = "jellyfin-session";

export type { StoredSession } from "../../jellyfin/credentials";

let cachedDeviceId = "";

export function getDeviceId(): string {
    if (cachedDeviceId) {
        return cachedDeviceId;
    }

    let deviceId = localStorage.getItem(DEVICE_ID_KEY);
    if (!deviceId) {
        const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        deviceId = "iina-jellyfin-";
        for (let i = 0; i < 16; i += 1) {
            deviceId += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        localStorage.setItem(DEVICE_ID_KEY, deviceId);
    }

    cachedDeviceId = deviceId;
    return deviceId;
}

export function createSessionStorage(storage: Pick<Storage, "getItem" | "removeItem">, credentials: SessionCredentials) {
    let pending: Promise<unknown> = Promise.resolve();
    const serialized = <T>(operation: () => Promise<T>): Promise<T> => {
        const result = pending.then(operation, operation);
        pending = result;
        return result;
    };

    return {
        load: () => serialized(async () => {
            const savedSession = await credentials.load();
            if (savedSession) {
                storage.removeItem(SESSION_KEY);
                return savedSession;
            }
            const legacy = storage.getItem(SESSION_KEY);
            if (!legacy) {
                return null;
            }
            const session = readLegacySession(legacy);
            await credentials.save(session);
            storage.removeItem(SESSION_KEY);
            return session;
        }),
        save: (session: StoredSession) => serialized(async () => {
            await credentials.save(session);
            storage.removeItem(SESSION_KEY);
        }),
        clear: (session: StoredSession) => serialized(async () => {
            await credentials.clear(session);
            const legacy = storage.getItem(SESSION_KEY);
            if (legacy && matchesSession(readLegacySession(legacy), session)) {
                storage.removeItem(SESSION_KEY);
            }
        })
    };
}

function readLegacySession(serialized: string): StoredSession {
    try {
        const session = parseStoredSession(JSON.parse(serialized));
        if (session) {
            return session;
        }
    } catch {
        // Keep the original data intact when migration cannot finish.
    }
    throw new Error("Your saved Jellyfin session could not be read. Sign in again.");
}

let sessionStorage: ReturnType<typeof createSessionStorage> | undefined;

function getSessionStorage(): ReturnType<typeof createSessionStorage> {
    sessionStorage ??= createSessionStorage(localStorage, createSessionCredentials(iina));
    return sessionStorage;
}

export function saveSessionToStorage(session: StoredSession): Promise<void> {
    return getSessionStorage().save(session);
}

export function loadSessionFromStorage(): Promise<StoredSession | null> {
    return getSessionStorage().load();
}

export function clearSessionFromStorage(session: StoredSession): Promise<void> {
    return getSessionStorage().clear(session);
}
