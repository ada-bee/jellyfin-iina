import { DEBUG_LOGS } from "../shared/constants";

export { isHttpsUrl, normalizeServerUrl } from "../jellyfin/url";

export function log(...args: unknown[]): void {
    if (DEBUG_LOGS) {
        console.log("Jellyfin UI:", ...args);
    }
}

export function getServerHost(serverUrl: string): string {
    try {
        return new URL(serverUrl).hostname;
    } catch (error) {
        return serverUrl;
    }
}

export function normalizeQuery(value: string): string {
    return value.trim().toLowerCase();
}
