import type {
    JellyfinAuthenticationResult,
    JellyfinBaseItem,
    JellyfinPlaybackInfoResponse,
    JellyfinPublicSystemInfo
} from "../shared/jellyfin";

import { buildMediaBrowserAuthorizationHeader } from "../shared/auth";
import { IINA_DEVICE_PROFILE } from "../shared/deviceProfile";
import { buildPlaybackInfoRequest } from "../shared/playback";

import { CLIENT_NAME, CLIENT_VERSION, DEVICE_NAME, ITEM_DETAILS_FIELDS } from "./constants";
import { isConfirmedAuthenticationFailure, JellyfinApiError } from "./apiError";
import { state } from "./state";
import { getDeviceId } from "./storage";
import { normalizeServerUrl } from "./utils";

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
type AuthenticationFailureHandler = () => void;

let authenticationFailureHandler: AuthenticationFailureHandler | null = null;

export function setAuthenticationFailureHandler(handler: AuthenticationFailureHandler): void {
    authenticationFailureHandler = handler;
}

function buildAuthHeader(accessToken: string): string {
    return buildMediaBrowserAuthorizationHeader({
        clientName: CLIENT_NAME,
        deviceName: DEVICE_NAME,
        deviceId: getDeviceId(),
        version: CLIENT_VERSION,
        token: accessToken
    });
}

export async function authenticateUser(
    serverUrl: string,
    username: string,
    password: string
): Promise<JellyfinAuthenticationResult> {
    const url = `${normalizeServerUrl(serverUrl)}/Users/AuthenticateByName`;
    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: buildAuthHeader("")
        },
        body: JSON.stringify({
            Username: username,
            Pw: password
        })
    });

    if (!response.ok) {
        if (response.status === 401) {
            throw new Error("Authentication failed. Check your credentials.");
        }
        throw new JellyfinApiError(response.status, "/Users/AuthenticateByName");
    }

    return await response.json();
}

export async function apiRequest<T>(method: HttpMethod, endpoint: string, data?: unknown): Promise<T | null> {
    const baseUrl = normalizeServerUrl(state.serverUrl);
    const url = `${baseUrl}${endpoint}`;
    const headers: Record<string, string> = {
        Authorization: buildAuthHeader(state.accessToken)
    };

    const options: RequestInit = {
        method: method,
        headers: headers
    };

    if (data !== undefined && (method === "POST" || method === "PUT" || method === "PATCH")) {
        headers["Content-Type"] = "application/json";
        options.body = JSON.stringify(data);
    }

    const response = await fetch(url, options);
    if (!response.ok) {
        const error = new JellyfinApiError(response.status, endpoint);
        if (response.status === 401 && state.accessToken && authenticationFailureHandler) {
            authenticationFailureHandler();
        }
        throw error;
    }

    if (response.status === 204) {
        return null;
    }

    const responseText = (await response.text()).trim();
    if (!responseText) {
        return null;
    }

    try {
        return JSON.parse(responseText) as T;
    } catch (error) {
        const snippet = responseText.slice(0, 200);
        throw new Error(`Expected JSON response for ${endpoint} but got: ${snippet}`.trim());
    }
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
    const endpoint = `/Users/${state.userId}/Items/${itemId}?Fields=${ITEM_DETAILS_FIELDS}`;
    return await apiRequest<JellyfinBaseItem>("GET", endpoint);
}

export async function fetchPlaybackInfo(itemId: string): Promise<JellyfinPlaybackInfoResponse | null> {
    return await apiRequest<JellyfinPlaybackInfoResponse>(
        "POST",
        `/Items/${itemId}/PlaybackInfo`,
        buildPlaybackInfoRequest(state.userId, IINA_DEVICE_PROFILE)
    );
}
