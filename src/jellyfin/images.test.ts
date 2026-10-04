import { describe, expect, test } from "bun:test";

import { buildJellyfinImageUrl } from "./images";

describe("Jellyfin image URLs", () => {
    test("preserves the Base URL path without exposing credentials on public images", () => {
        const url = new URL(buildJellyfinImageUrl({
            serverUrl: "https://media.example.test/jellyfin/",
            accessToken: "secret token",
            itemId: "item-id",
            imageType: "Thumb",
            maxWidth: 160
        }));

        expect(url.pathname).toBe("/jellyfin/Items/item-id/Images/Thumb");
        expect(url.searchParams.has("api_key")).toBe(false);
        expect(url.href).not.toContain("secret");
        expect(url.searchParams.get("maxWidth")).toBe("160");
    });

    test("encodes item and image type route segments", () => {
        const url = new URL(buildJellyfinImageUrl({
            serverUrl: "https://media.example.test",
            accessToken: "token",
            itemId: "item/id",
            imageType: "Primary/Image"
        }));

        expect(url.pathname).toBe("/Items/item%2Fid/Images/Primary%2FImage");
    });

    test("does not create a URL without a server or item", () => {
        expect(buildJellyfinImageUrl({
            serverUrl: "",
            accessToken: "token",
            itemId: "item-id"
        })).toBe("");
        expect(buildJellyfinImageUrl({
            serverUrl: "https://media.example.test",
            accessToken: "token",
            itemId: ""
        })).toBe("");
    });
});
