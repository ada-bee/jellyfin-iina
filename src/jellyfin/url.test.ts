import { describe, expect, test } from "bun:test";

import { isHttpsUrl, isSameServerUrl, normalizeServerUrl, resolveDeliveryUrl } from "./url";

const serverUrl = "https://media.example.test/jellyfin/";

describe("Jellyfin delivery URLs", () => {
    test("resolves relative paths without losing or duplicating the Base URL", () => {
        for (const path of ["/Videos/item/stream", "Videos/item/stream", "/jellyfin/Videos/item/stream"]) {
            expect(resolveDeliveryUrl(serverUrl, path)).toBe(
                "https://media.example.test/jellyfin/Videos/item/stream"
            );
        }
        expect(resolveDeliveryUrl(serverUrl, "/jellyfish/stream")).toBe(
            "https://media.example.test/jellyfin/jellyfish/stream"
        );
        expect(resolveDeliveryUrl("https://media.example.test", "/Videos/item/stream")).toBe(
            "https://media.example.test/Videos/item/stream"
        );
    });

    test("removes all legacy credential parameters while preserving delivery options", () => {
        const url = resolveDeliveryUrl(serverUrl,
            "/Videos/item/stream?MediaSourceId=source&api_key=secret&ACCESS_TOKEN=secret"
            + "&X-Emby-Token=secret&ApiKey=secret&%61pi%5Fkey=secret&format=srt&api_key=other#fragment"
        );
        expect(url).toBe(
            "https://media.example.test/jellyfin/Videos/item/stream?MediaSourceId=source&format=srt"
        );
    });

    test("allows credential-free external HTTPS deliveries without treating them as the server", () => {
        const url = resolveDeliveryUrl(serverUrl, "https://cdn.example.test/English%20subtitle.srt?api_key=secret&lang=en");
        expect(url).toBe("https://cdn.example.test/English%20subtitle.srt?lang=en");
        expect(isSameServerUrl(serverUrl, url)).toBe(false);
    });

    test("rejects unsafe delivery references and malformed server URLs", () => {
        for (const delivery of [
            "http://media.example.test/subtitle.srt",
            "file:///tmp/subtitle.srt",
            "//other.example.test/subtitle.srt",
            "https://user:password@media.example.test/subtitle.srt",
            "https://media.example.test\\@other.example.test/subtitle.srt",
            "https://media.example.test\n@other.example.test/subtitle.srt",
            "/Videos/../private",
            "/Videos/%2e%2e/private",
            "/Videos/%252e%252e/private",
            "/Videos/%2f..%2fprivate",
            "/Videos/%5c..%5cprivate",
            "/Videos/%00private",
            "/Videos/%broken",
            ""
        ]) {
            expect(resolveDeliveryUrl(serverUrl, delivery)).toBe("");
        }
        for (const server of ["http://media.example.test", `${serverUrl}?api_key=secret`, `${serverUrl}#fragment`]) {
            expect(resolveDeliveryUrl(server, "/Videos/item/stream")).toBe("");
        }
    });
});

describe("Jellyfin authenticated URL scope", () => {
    test("compares HTTPS origin and the complete Base URL segment", () => {
        expect(isSameServerUrl(serverUrl, "HTTPS://MEDIA.EXAMPLE.TEST:443/jellyfin/Videos/item")).toBe(true);
        expect(isSameServerUrl(serverUrl, "https://media.example.test/jellyfin?query=value")).toBe(true);
        for (const url of [
            "https://media.example.test/jellyfish/Videos/item",
            "https://media.example.test/jellyfin-other/Videos/item",
            "https://media.example.test/Videos/item",
            "https://media.example.test:8443/jellyfin/Videos/item",
            "https://other.example.test/jellyfin/Videos/item",
            "http://media.example.test/jellyfin/Videos/item"
        ]) {
            expect(isSameServerUrl(serverUrl, url)).toBe(false);
        }
    });

    test("never authenticates path traversal or ambiguous URL parsing", () => {
        for (const suffix of [
            "../private", "%2e%2e/private", ".%2e/private", "%252e%252e/private",
            "nested/%2f../private", "nested/%5c../private", "..;/private", "%00private"
        ]) {
            expect(isSameServerUrl(serverUrl, `${serverUrl}${suffix}`)).toBe(false);
        }
        for (const url of [
            "https://media.example.test@other.example.test/jellyfin/item",
            "https://media.example.test\\@other.example.test/jellyfin/item",
            "https://media.example.test\t.other.example.test/jellyfin/item",
            "https://media.example.test%2eother.example.test/jellyfin/item"
        ]) {
            expect(isSameServerUrl(serverUrl, url)).toBe(false);
        }
    });

    test("supports server roots, ports, and IPv6 literals", () => {
        expect(isSameServerUrl("https://media.example.test/", "https://media.example.test/Videos/item")).toBe(true);
        expect(isSameServerUrl("https://[::1]:8920/jellyfin", "https://[::1]:8920/jellyfin/Videos/item")).toBe(true);
        expect(isSameServerUrl("https://[::1]:8920/jellyfin", "https://[::1]/jellyfin/Videos/item")).toBe(false);
    });

    test("validates HTTPS URLs while preserving server normalization", () => {
        expect(isHttpsUrl(" https://media.example.test/jellyfin ")).toBe(true);
        expect(isHttpsUrl("https://")).toBe(false);
        expect(isHttpsUrl("https://user:password@media.example.test")).toBe(false);
        expect(normalizeServerUrl(" https://media.example.test/jellyfin/// ")).toBe(
            "https://media.example.test/jellyfin"
        );
    });
});
