import { describe, expect, test } from "bun:test";
import { buildMediaBrowserAuthorizationHeader } from "./auth";

describe("Jellyfin authorization headers", () => {
    test("percent encodes quoted values for Jellyfin's header parser", () => {
        expect(buildMediaBrowserAuthorizationHeader({
            clientName: "Jellyfin IINA", deviceName: 'Mac "Desk",\\',
            deviceId: "device", version: "3.0.0", token: "token"
        })).toBe('MediaBrowser Client="Jellyfin%20IINA", Device="Mac%20%22Desk%22%2C%5C", '
            + 'DeviceId="device", Version="3.0.0", Token="token"');
    });

    test("rejects header injection without exposing the value", () => {
        expect(() => buildMediaBrowserAuthorizationHeader({
            clientName: "IINA", deviceName: "IINA", deviceId: "device", version: "3.0.0",
            token: "secret\r\nInjected: value"
        })).toThrow("Invalid Jellyfin authentication header.");
    });
});
