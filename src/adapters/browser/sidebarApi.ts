import type {
    JellyfinAuthenticationResult,
    JellyfinBaseItem,
    JellyfinPlaybackInfoResponse
} from "../../jellyfin/types";

import { createFetchTransport } from "./fetchTransport";
import {
    JellyfinClient,
    JellyfinHttpError,
    JellyfinJsonError,
    JellyfinRequestOptions,
    type HttpMethod
} from "../../jellyfin/client";
import { IINA_DEVICE_PROFILE } from "../../jellyfin/deviceProfile";
import { buildPlaybackInfoRequest } from "../../playback/negotiation";
import type { PlaybackStreamSelection } from "../../playback/negotiation";

import { CLIENT_NAME, DEVICE_NAME } from "../../shared/constants";
import { CLIENT_VERSION } from "../../jellyfin/version";
import { ITEM_DETAILS_FIELDS } from "../../jellyfin/fields";
import { JellyfinApiError } from "../../jellyfin/apiError";
import { buildItemDetailsEndpoint } from "../../jellyfin/endpoints";
import { state } from "../../sidebar/store";
import { getDeviceId } from "./storage";

type AuthenticationFailureHandler = () => void;

let authenticationFailureHandler: AuthenticationFailureHandler | null = null;
let authenticationGeneration = 0;
const client = new JellyfinClient(createFetchTransport(), {
    clientName: CLIENT_NAME,
    deviceName: DEVICE_NAME,
    version: CLIENT_VERSION
});

export function setAuthenticationFailureHandler(handler: AuthenticationFailureHandler): void {
    authenticationFailureHandler = handler;
}

export function invalidateAuthenticationRequests(): void {
    authenticationGeneration += 1;
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

    const connection = {
        serverUrl: state.serverUrl,
        accessToken: state.accessToken,
        deviceId: getDeviceId()
    };
    const generation = authenticationGeneration;
    const userId = state.userId;
    const isCurrent = () => generation === authenticationGeneration
        && connection.serverUrl === state.serverUrl
        && connection.accessToken === state.accessToken
        && userId === state.userId;

    try {
        const result = await client.requestJson<T>(connection, options);
        if (!isCurrent()) {
            throw new Error("The Jellyfin session changed during this request.");
        }
        return result;
    } catch (error) {
        const mappedError = mapClientError(error, endpoint);
        if (mappedError instanceof JellyfinApiError
            && mappedError.status === 401
            && connection.accessToken
            && isCurrent()
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
        return new Error(error.message);
    }
    return error;
}

export async function fetchItemDetails(itemId: string): Promise<JellyfinBaseItem | null> {
    const endpoint = buildItemDetailsEndpoint(state.userId, itemId, ITEM_DETAILS_FIELDS);
    return await apiRequest<JellyfinBaseItem>("GET", endpoint);
}

export async function fetchPlaybackInfo(
    itemId: string,
    selection: PlaybackStreamSelection = {}
): Promise<JellyfinPlaybackInfoResponse | null> {
    return await apiRequest<JellyfinPlaybackInfoResponse>(
        "POST",
        `/Items/${encodeURIComponent(itemId)}/PlaybackInfo`,
        buildPlaybackInfoRequest(state.userId, IINA_DEVICE_PROFILE, selection)
    );
}
