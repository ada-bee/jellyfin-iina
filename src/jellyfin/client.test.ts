import { describe, expect, test } from "bun:test";

import type { HttpRequest, HttpResponse, HttpTransport } from "./client";

import {
    JellyfinClient,
    JellyfinHttpError,
    JellyfinJsonError
} from "./client";

const connection = {
    serverUrl: "https://media.example.test/jellyfin/",
    accessToken: "secret token",
    deviceId: "device-id"
};

const identity = {
    clientName: "Jellyfin IINA",
    deviceName: "IINA",
    version: "3.0.0"
};

function createClient(response: HttpResponse) {
    const requests: HttpRequest[] = [];
    const transport: HttpTransport = {
        send: async (request) => {
            requests.push(request);
            return response;
        }
    };
    return {
        client: new JellyfinClient(transport, identity),
        requests
    };
}

describe("JellyfinClient", () => {
    test("builds an authenticated request and preserves the server base path", async () => {
        const { client, requests } = createClient({
            status: 200,
            statusText: "OK",
            data: { Items: [] }
        });

        await client.requestJson(connection, {
            method: "POST",
            endpoint: "MediaSegments/item/id",
            query: {
                includeSegmentTypes: ["Intro", "Outro"],
                empty: null
            },
            body: { enabled: true },
            headers: { "X-Test": "value" }
        });

        expect(requests).toHaveLength(1);
        expect(requests[0]).toMatchObject({
            method: "POST",
            url: "https://media.example.test/jellyfin/MediaSegments/item/id" +
                "?includeSegmentTypes=Intro&includeSegmentTypes=Outro",
            body: { enabled: true },
            headers: {
                Authorization: "MediaBrowser Client=\"Jellyfin%20IINA\", Device=\"IINA\", " +
                    "DeviceId=\"device-id\", Version=\"3.0.0\", Token=\"secret%20token\"",
                "Content-Type": "application/json",
                "X-Test": "value"
            }
        });
    });

    test("uses parsed IINA response data before response text", async () => {
        const { client } = createClient({
            status: 200,
            statusText: "OK",
            data: { source: "data" },
            text: "{\"source\":\"text\"}"
        });

        expect(await client.requestJson(connection, {
            method: "GET",
            endpoint: "/Items"
        })).toEqual({ source: "data" });
    });

    test("parses text responses and treats empty bodies as null", async () => {
        const parsed = createClient({
            status: 200,
            statusText: "OK",
            text: "  {\"Name\":\"Server\"}  "
        });
        const empty = createClient({
            status: 204,
            statusText: "No Content",
            text: ""
        });

        expect(await parsed.client.requestJson(connection, {
            method: "GET",
            endpoint: "/System/Info/Public"
        })).toEqual({ Name: "Server" });
        expect(await empty.client.requestJson(connection, {
            method: "POST",
            endpoint: "/Sessions/Playing"
        })).toBeNull();
    });

    test("exposes structured HTTP and JSON failures to callers", async () => {
        const failed = createClient({
            status: 503,
            statusText: "Unavailable",
            text: "try later"
        });
        const malformed = createClient({
            status: 200,
            statusText: "OK",
            text: "not json"
        });

        const httpError = failed.client.requestJson(connection, {
            method: "GET",
            endpoint: "/Items"
        });
        await expect(httpError).rejects.toEqual(expect.objectContaining({
            name: "JellyfinHttpError",
            status: 503,
            endpoint: "/Items",
            responseText: "try later"
        } satisfies Partial<JellyfinHttpError>));

        const jsonError = malformed.client.requestJson(connection, {
            method: "GET",
            endpoint: "/Items"
        });
        await expect(jsonError).rejects.toBeInstanceOf(JellyfinJsonError);
    });

    test("rejects insecure server URLs before using the transport", async () => {
        const { client, requests } = createClient({ status: 200, statusText: "OK" });

        await expect(client.requestJson({
            ...connection,
            serverUrl: "http://media.example.test"
        }, {
            method: "GET",
            endpoint: "/Items"
        })).rejects.toThrow("Jellyfin server URL must start with https://");
        expect(requests).toHaveLength(0);
    });

    test("redacts credentials echoed by the server or transport", async () => {
        const echoed = `ApiKey=${encodeURIComponent(connection.accessToken)}`;
        const failed = createClient({
            status: 403,
            statusText: "Forbidden",
            text: `Request /Videos/item?${echoed}; Token="${connection.accessToken}"`
        });
        const failure = await failed.client.requestJson(connection, {
            method: "GET", endpoint: "/Items"
        }).catch(error => error as JellyfinHttpError);
        expect(failure.responseText).not.toContain(connection.accessToken);
        expect(failure.responseText).not.toContain(encodeURIComponent(connection.accessToken));

        const transportFailure = new JellyfinClient({
            send: async () => { throw new Error(`Cannot connect: ${connection.accessToken}, password-value`); }
        }, identity);
        await expect(transportFailure.requestJson(connection, {
            method: "POST", endpoint: "/Users/AuthenticateByName", body: { Pw: "password-value" }
        })).rejects.toThrow("Cannot connect: [redacted], [redacted]");
    });

    test("does not display a malformed response containing authentication data", async () => {
        const { client } = createClient({
            status: 200,
            statusText: "OK",
            text: `not JSON: {"AccessToken":"${connection.accessToken}"}`
        });
        const error = await client.requestJson(connection, { method: "GET", endpoint: "/Items" })
            .catch(failure => failure as JellyfinJsonError);
        expect(error.message).toBe("Jellyfin returned invalid JSON for /Items.");
        expect(error.snippet).not.toContain(connection.accessToken);
    });
});
