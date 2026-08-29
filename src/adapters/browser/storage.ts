const DEVICE_ID_KEY = "jellyfin-device-id";
const SESSION_KEY = "jellyfin-session";

export interface StoredSession {
    serverUrl: string;
    serverName: string;
    accessToken: string;
    userId: string;
    username: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function parseStoredSession(value: unknown): StoredSession | null {
    if (!isRecord(value)) {
        return null;
    }

    if (typeof value.serverUrl !== "string" || !value.serverUrl) {
        return null;
    }
    if (typeof value.serverName !== "string") {
        return null;
    }
    if (typeof value.accessToken !== "string" || !value.accessToken) {
        return null;
    }
    if (typeof value.userId !== "string" || !value.userId) {
        return null;
    }
    if (typeof value.username !== "string") {
        return null;
    }
    return {
        serverUrl: value.serverUrl,
        serverName: value.serverName,
        accessToken: value.accessToken,
        userId: value.userId,
        username: value.username
    };
}

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

export function saveSessionToStorage(session: StoredSession): void {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function loadSessionFromStorage(): StoredSession | null {
    try {
        const stored = localStorage.getItem(SESSION_KEY);
        if (!stored) {
            return null;
        }
        const sessionData = parseStoredSession(JSON.parse(stored));
        if (sessionData) {
            return sessionData;
        }
        clearSessionFromStorage();
    } catch (error) {
        clearSessionFromStorage();
        console.error("Failed to load session from localStorage:", error);
    }
    return null;
}

export function clearSessionFromStorage(): void {
    localStorage.removeItem(SESSION_KEY);
}
