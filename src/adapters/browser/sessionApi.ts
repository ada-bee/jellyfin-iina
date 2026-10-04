import type { StoredSession } from "../../jellyfin/credentials";
import type { JellyfinPublicSystemInfo } from "../../jellyfin/types";
import { JellyfinApiError } from "../../jellyfin/apiError";
import { JellyfinClient, JellyfinHttpError, JellyfinJsonError } from "../../jellyfin/client";
import { CLIENT_VERSION } from "../../jellyfin/version";
import { CLIENT_NAME, DEVICE_NAME } from "../../shared/constants";
import { createFetchTransport } from "./fetchTransport";
import { getDeviceId } from "./storage";

const client = new JellyfinClient(createFetchTransport(), {
    clientName: CLIENT_NAME,
    deviceName: DEVICE_NAME,
    version: CLIENT_VERSION
});

export class InvalidSessionIdentityError extends Error {
    constructor() {
        super("Jellyfin could not confirm the account for your saved session. Sign in again.");
        this.name = "InvalidSessionIdentityError";
    }
}

export async function validateStoredSession(session: StoredSession): Promise<StoredSession> {
    const endpoint = "/Users/Me";
    try {
        const user = await client.requestJson<{ Id?: string; Name?: string }>({
            ...session,
            deviceId: getDeviceId()
        }, { method: "GET", endpoint });
        if (!user?.Id || user.Id !== session.userId) {
            throw new InvalidSessionIdentityError();
        }
        return { ...session, username: user.Name || session.username };
    } catch (error) {
        if (error instanceof JellyfinHttpError) {
            throw new JellyfinApiError(error.status, endpoint);
        }
        if (error instanceof JellyfinJsonError) {
            throw new InvalidSessionIdentityError();
        }
        throw error;
    }
}

export async function fetchSessionServerName(session: StoredSession): Promise<string> {
    try {
        const info = await client.requestJson<JellyfinPublicSystemInfo>({
            ...session,
            deviceId: getDeviceId()
        }, { method: "GET", endpoint: "/System/Info/Public" });
        return info?.ServerName || "";
    } catch {
        return "";
    }
}
