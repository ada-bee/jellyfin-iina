import { describe, expect, test } from "bun:test";

import { createFetchTransport } from "./fetchTransport";

describe("fetch HTTP transport", () => {
    test("serializes JSON bodies and returns response text", async () => {
        const calls: Array<{ url: string; init?: RequestInit }> = [];
        const fetchImplementation = (async (url: string | URL | Request, init?: RequestInit) => {
            calls.push({ url: String(url), init });
            return {
                status: 200,
                statusText: "OK",
                text: async () => "{\"Id\":\"item-id\"}"
            } as Response;
        }) as typeof fetch;

        const response = await createFetchTransport(fetchImplementation).send({
            method: "POST",
            url: "https://media.example.test/Items",
            headers: {
                Authorization: "MediaBrowser test",
                "Content-Type": "application/json"
            },
            body: { Name: "Item" }
        });

        expect(calls).toEqual([{
            url: "https://media.example.test/Items",
            init: {
                method: "POST",
                headers: {
                    Authorization: "MediaBrowser test",
                    "Content-Type": "application/json"
                },
                body: "{\"Name\":\"Item\"}"
            }
        }]);
        expect(response).toEqual({
            status: 200,
            statusText: "OK",
            text: "{\"Id\":\"item-id\"}"
        });
    });
});
