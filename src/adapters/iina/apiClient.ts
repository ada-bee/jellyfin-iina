import { createIinaHttpTransport } from "./httpTransport";
import {
    JellyfinClient,
    JellyfinHttpError,
    JellyfinJsonError
} from "../../jellyfin/client";
import { CLIENT_NAME, CLIENT_VERSION, DEVICE_NAME } from "./constants";

const { http } = iina;
const client = new JellyfinClient(createIinaHttpTransport(http), {
    clientName: CLIENT_NAME,
    deviceName: DEVICE_NAME,
    version: CLIENT_VERSION
});

export interface HttpContext {
    serverUrl: string;
    accessToken: string;
    deviceId: string;
}

export interface HttpRequestOptions {
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    endpoint: string;
    query?: Record<string, string | number | boolean | null | undefined>;
    body?: unknown;
    headers?: Record<string, string>;
}

export async function requestJson<T>(
    context: HttpContext,
    options: HttpRequestOptions
): Promise<T | null> {
    try {
        return await client.requestJson<T>(context, options);
    } catch (error) {
        throw mapClientError(error);
    }
}

function mapClientError(error: unknown): unknown {
    if (error instanceof JellyfinHttpError) {
        const detail = error.responseText ? ` - ${error.responseText.slice(0, 200)}` : "";
        return new Error(`HTTP ${error.status} ${error.statusText}${detail}`.trim());
    }
    if (error instanceof JellyfinJsonError) {
        return new Error(`Expected JSON response but got: ${error.snippet}`.trim());
    }
    return error;
}
