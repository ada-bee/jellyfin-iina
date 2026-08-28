import { DEBUG_LOGS } from "./constants";

const { console } = iina;

export function logDebug(...args: unknown[]): void {
    if (DEBUG_LOGS) {
        console.log(...args);
    }
}

export { isHttpsUrl, normalizeServerUrl } from "../shared/url";

const SENSITIVE_QUERY_KEYS = new Set([
    "api_key",
    "access_token",
    "token",
    "x-emby-token"
]);

export function redactUrlForLog(url: string, maxLength: number = 120): string {
    if (!url) {
        return "";
    }

    const queryIndex = url.indexOf("?");
    if (queryIndex === -1) {
        return truncateLogValue(url, maxLength);
    }

    const base = url.substring(0, queryIndex);
    const query = url.substring(queryIndex + 1);
    const parts = query.split("&");
    const redactedParts = parts.map((part) => {
        const eqIndex = part.indexOf("=");
        if (eqIndex === -1) {
            return part;
        }
        const key = part.substring(0, eqIndex);
        if (isSensitiveQueryKey(key)) {
            return `${key}=REDACTED`;
        }
        return part;
    });

    return truncateLogValue(`${base}?${redactedParts.join("&")}`, maxLength);
}

function isSensitiveQueryKey(key: string): boolean {
    const normalizedKey = normalizeQueryKey(key);
    return SENSITIVE_QUERY_KEYS.has(normalizedKey);
}

function normalizeQueryKey(key: string): string {
    const trimmedKey = key.trim();
    if (!trimmedKey) {
        return "";
    }
    try {
        return decodeURIComponent(trimmedKey).trim().toLowerCase();
    } catch (error) {
        return trimmedKey.toLowerCase();
    }
}

export function sanitizeMediaTitle(title: string): string {
    return String(title).replace(/[\n\r,=]/g, " ");
}

export function formatError(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }
    return String(error);
}

function truncateLogValue(value: string, maxLength: number): string {
    if (maxLength <= 0 || value.length <= maxLength) {
        return value;
    }
    return `${value.substring(0, maxLength)}...`;
}

export function buildQueryString(
    params: Record<string, string | number | boolean | null | undefined>
): string {
    const parts: string[] = [];
    Object.keys(params).forEach((key) => {
        const value = params[key];
        if (value === undefined || value === null) {
            return;
        }
        parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
    });
    return parts.join("&");
}
