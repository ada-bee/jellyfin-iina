import { createIinaHttpTransport } from "./httpTransport";
import {
    JellyfinClient,
    JellyfinHttpError,
    JellyfinJsonError,
    type JellyfinConnection,
    type JellyfinRequestOptions
} from "../../jellyfin/client";
import { CLIENT_NAME, CLIENT_VERSION, DEVICE_NAME } from "./constants";

const { http } = iina;
const client = new JellyfinClient(createIinaHttpTransport(http), {
    clientName: CLIENT_NAME,
    deviceName: DEVICE_NAME,
    version: CLIENT_VERSION
});

export async function requestJson<T>(
    context: JellyfinConnection,
    options: JellyfinRequestOptions
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
        return new Error(error.message);
    }
    return error;
}
