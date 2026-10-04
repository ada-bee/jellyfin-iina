export const CREDENTIAL_SERVICE = "jellyfin-session";
export const CREDENTIAL_ACCOUNT = "default";

export interface StoredSession {
    serverUrl: string;
    serverName: string;
    accessToken: string;
    userId: string;
    username: string;
}

export type CredentialRequest =
    | { requestId: string; operation: "load" }
    | { requestId: string; operation: "save"; session: StoredSession }
    | { requestId: string; operation: "clear"; session: StoredSession };

export type CredentialResponse =
    | { requestId: string; ok: true; session: StoredSession | null }
    | { requestId: string; ok: false; error: string };

export function matchesSession(left: StoredSession, right: StoredSession): boolean {
    return normalizeServerUrl(left.serverUrl) === normalizeServerUrl(right.serverUrl)
        && left.accessToken === right.accessToken
        && left.userId === right.userId;
}

export function parseStoredSession(value: unknown): StoredSession | null {
    if (typeof value !== "object" || value === null) {
        return null;
    }
    const record = value as Record<string, unknown>;
    const required = ["serverUrl", "accessToken", "userId"];
    if (!required.every(key => typeof record[key] === "string" && record[key])) {
        return null;
    }
    if (typeof record.serverName !== "string" || typeof record.username !== "string") {
        return null;
    }
    return {
        serverUrl: record.serverUrl as string,
        serverName: record.serverName,
        accessToken: record.accessToken as string,
        userId: record.userId as string,
        username: record.username
    };
}
import { normalizeServerUrl } from "./url";
