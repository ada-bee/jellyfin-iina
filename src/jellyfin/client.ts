import { buildMediaBrowserAuthorizationHeader } from "./auth";
import { isHttpsUrl, normalizeServerUrl } from "./url";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface HttpRequest {
    method: HttpMethod;
    url: string;
    headers: Record<string, string>;
    body?: unknown;
}

export interface HttpResponse {
    status: number;
    statusText: string;
    data?: unknown;
    text?: string;
}

export interface HttpTransport {
    send(request: HttpRequest): Promise<HttpResponse>;
}

export interface JellyfinClientIdentity {
    clientName: string;
    deviceName: string;
    version: string;
}

export interface JellyfinConnection {
    serverUrl: string;
    accessToken: string;
    deviceId: string;
}

type QueryScalar = string | number | boolean;
export type QueryValue = QueryScalar | readonly QueryScalar[] | null | undefined;

export interface JellyfinRequestOptions {
    method: HttpMethod;
    endpoint: string;
    query?: Record<string, QueryValue>;
    body?: unknown;
    headers?: Record<string, string>;
}

export class JellyfinHttpError extends Error {
    constructor(
        readonly status: number,
        readonly endpoint: string,
        readonly statusText: string,
        readonly responseText: string
    ) {
        super(`Jellyfin request failed (${status}) for ${endpoint}.`);
        this.name = "JellyfinHttpError";
    }
}

export class JellyfinJsonError extends Error {
    constructor(
        readonly endpoint: string,
        readonly snippet: string
    ) {
        super(`Expected JSON response for ${endpoint} but got: ${snippet}`.trim());
        this.name = "JellyfinJsonError";
    }
}

export class JellyfinClient {
    constructor(
        private readonly transport: HttpTransport,
        private readonly identity: JellyfinClientIdentity
    ) {}

    async requestJson<T>(
        connection: JellyfinConnection,
        options: JellyfinRequestOptions
    ): Promise<T | null> {
        const response = await this.send(connection, options);

        if (response.data !== undefined && response.data !== null) {
            if (typeof response.data !== "string") {
                return response.data as T;
            }
            return this.parseJson<T>(options.endpoint, response.data);
        }

        const responseText = response.text ? String(response.text).trim() : "";
        if (!responseText) {
            return null;
        }
        return this.parseJson<T>(options.endpoint, responseText);
    }

    private async send(
        connection: JellyfinConnection,
        options: JellyfinRequestOptions
    ): Promise<HttpResponse> {
        const request = this.buildRequest(connection, options);
        const response = await this.transport.send(request);
        if (response.status < 200 || response.status >= 300) {
            throw new JellyfinHttpError(
                response.status,
                options.endpoint,
                response.statusText,
                response.text ? String(response.text) : ""
            );
        }
        return response;
    }

    private buildRequest(
        connection: JellyfinConnection,
        options: JellyfinRequestOptions
    ): HttpRequest {
        const serverUrl = normalizeServerUrl(connection.serverUrl);
        if (!isHttpsUrl(serverUrl)) {
            throw new Error("Jellyfin server URL must start with https://");
        }

        const endpoint = options.endpoint.startsWith("/")
            ? options.endpoint
            : `/${options.endpoint}`;
        const queryString = buildQueryString(options.query);
        const headers: Record<string, string> = {
            Authorization: buildMediaBrowserAuthorizationHeader({
                clientName: this.identity.clientName,
                deviceName: this.identity.deviceName,
                deviceId: connection.deviceId,
                version: this.identity.version,
                token: connection.accessToken
            }),
            ...(options.headers || {})
        };
        if (options.body !== undefined) {
            headers["Content-Type"] = "application/json";
        }

        return {
            method: options.method,
            url: `${serverUrl}${endpoint}${queryString ? `?${queryString}` : ""}`,
            headers,
            ...(options.body !== undefined ? { body: options.body } : {})
        };
    }

    private parseJson<T>(endpoint: string, responseText: string): T {
        try {
            return JSON.parse(responseText) as T;
        } catch (error) {
            throw new JellyfinJsonError(endpoint, responseText.slice(0, 200));
        }
    }
}

function buildQueryString(query?: Record<string, QueryValue>): string {
    if (!query) {
        return "";
    }

    const parts: string[] = [];
    Object.keys(query).forEach((key) => {
        const value = query[key];
        if (value === undefined || value === null) {
            return;
        }
        const values = Array.isArray(value) ? value : [value];
        values.forEach((entry) => {
            parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(entry))}`);
        });
    });
    return parts.join("&");
}
