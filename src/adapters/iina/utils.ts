import { DEBUG_LOGS } from "./constants";

export function logDebug(...args: unknown[]): void {
    if (DEBUG_LOGS) {
        iina.console.log(...args);
    }
}

export { isHttpsUrl, normalizeServerUrl } from "../../jellyfin/url";
