import { describe, expect, test } from "bun:test";

import { createIinaHttpTransport } from "./httpTransport";

describe("IINA HTTP transport", () => {
    test("dispatches through the matching IINA method without serializing the body", async () => {
        const calls: Array<{ url: string; options: IINA.HTTPRequestOption<unknown> }> = [];
        const http = {
            post: async (url: string, options: IINA.HTTPRequestOption<unknown>) => {
                calls.push({ url, options });
                return {
                    statusCode: 201,
                    reason: "Created",
                    data: { Id: "item-id" },
                    text: ""
                };
            }
        } as unknown as IINA.API.HTTP;

        const response = await createIinaHttpTransport(http).send({
            method: "POST",
            url: "https://media.example.test/Items",
            headers: { Authorization: "MediaBrowser test" },
            body: { Name: "Item" }
        });

        expect(calls).toEqual([{
            url: "https://media.example.test/Items",
            options: {
                params: {},
                headers: { Authorization: "MediaBrowser test" },
                data: { Name: "Item" }
            }
        }]);
        expect(response).toEqual({
            status: 201,
            statusText: "Created",
            data: { Id: "item-id" },
            text: ""
        });
    });
});
