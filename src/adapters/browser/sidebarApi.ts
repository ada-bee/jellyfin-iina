import type {
    JellyfinAuthenticationResult,
    JellyfinBaseItem,
    JellyfinPlaybackInfoResponse,
    JellyfinPublicSystemInfo
} from "../../jellyfin/types";

import { createFetchTransport } from "./fetchTransport";
import {
    JellyfinClient,
    JellyfinHttpError,
    JellyfinJsonError,
    JellyfinRequestOptions
} from "../../jellyfin/client";
import { IINA_DEVICE_PROFILE } from "../../jellyfin/deviceProfile";
import { buildPlaybackInfoRequest } from "../../playback/negotiation";

import { CLIENT_NAME, DEVICE_NAME } from "../../shared/constants";
import { CLIENT_VERSION } from "../../jellyfin/version";
import { ITEM_DETAILS_FIELDS } from "../../jellyfin/fields";
import { isConfirmedAuthenticationFailure, JellyfinApiError } from "../../jellyfin/apiError";
import { buildItemDetailsEndpoint } from "../../jellyfin/endpoints";
import { state } from "../../sidebar/store";
import { getDeviceId } from "./storage";

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
type AuthenticationFailureHandler = () => void;

let authenticationFailureHandler: AuthenticationFailureHandler | null = null;
const client = new JellyfinClient(createFetchTransport(), {
    clientName: CLIENT_NAME,
    deviceName: DEVICE_NAME,
    version: CLIENT_VERSION
});

export function setAuthenticationFailureHandler(handler: AuthenticationFailureHandler): void {
    authenticationFailureHandler = handler;
}

export async function authenticateUser(
    serverUrl: string,
    username: string,
    password: string
): Promise<JellyfinAuthenticationResult> {
    const endpoint = "/Users/AuthenticateByName";
    try {
        const result = await client.requestJson<JellyfinAuthenticationResult>({
            serverUrl,
            accessToken: "",
            deviceId: getDeviceId()
        }, {
            method: "POST",
            endpoint,
            body: {
                Username: username,
                Pw: password
            }
        });
        if (!result) {
            throw new Error("Missing authentication response.");
        }
        return result;
    } catch (error) {
        if (error instanceof JellyfinHttpError && error.status === 401) {
            throw new Error("Authentication failed. Check your credentials.");
        }
        throw mapClientError(error, endpoint);
    }
}

export async function apiRequest<T>(method: HttpMethod, endpoint: string, data?: unknown): Promise<T | null> {
    const options: JellyfinRequestOptions = { method, endpoint };
    if (data !== undefined && (method === "POST" || method === "PUT" || method === "PATCH")) {
        options.body = data;
    }

    try {
        return await client.requestJson<T>({
            serverUrl: state.serverUrl,
            accessToken: state.accessToken,
            deviceId: getDeviceId()
        }, options);
    } catch (error) {
        const mappedError = mapClientError(error, endpoint);
        if (mappedError instanceof JellyfinApiError
            && mappedError.status === 401
            && state.accessToken
            && authenticationFailureHandler) {
            authenticationFailureHandler();
        }
        throw mappedError;
    }
}

function mapClientError(error: unknown, endpoint: string): unknown {
    if (error instanceof JellyfinHttpError) {
        return new JellyfinApiError(error.status, endpoint);
    }
    if (error instanceof JellyfinJsonError) {
        return new Error(`Expected JSON response for ${endpoint} but got: ${error.snippet}`.trim());
    }
    return error;
}

export async function fetchServerName(): Promise<string> {
    try {
        const systemInfo = await apiRequest<JellyfinPublicSystemInfo>("GET", "/System/Info/Public");
        return systemInfo?.ServerName || "";
    } catch (error) {
        if (isConfirmedAuthenticationFailure(error)) {
            throw error;
        }
        console.error("Failed to fetch server name:", error);
        return "";
    }
}

export async function fetchItemDetails(itemId: string): Promise<JellyfinBaseItem | null> {
    const endpoint = buildItemDetailsEndpoint(state.userId, itemId, ITEM_DETAILS_FIELDS);
    return await apiRequest<JellyfinBaseItem>("GET", endpoint);
}

export async function fetchPlaybackInfo(itemId: string): Promise<JellyfinPlaybackInfoResponse | null> {
    return await apiRequest<JellyfinPlaybackInfoResponse>(
        "POST",
        `/Items/${encodeURIComponent(itemId)}/PlaybackInfo`,
        buildPlaybackInfoRequest(state.userId, IINA_DEVICE_PROFILE)
    );
}
