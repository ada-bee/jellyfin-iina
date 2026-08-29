import { describe, expect, test } from "bun:test";

import { isConfirmedAuthenticationFailure, JellyfinApiError } from "./apiError";

describe("Jellyfin API authentication failures", () => {
    test("treats an explicit 401 as an invalid session", () => {
        expect(isConfirmedAuthenticationFailure(
            new JellyfinApiError(401, "/Users/user/Items")
        )).toBeTrue();
    });

    test("does not discard a session after a permission error", () => {
        expect(isConfirmedAuthenticationFailure(
            new JellyfinApiError(403, "/Users/user/Items")
        )).toBeFalse();
    });

    test("does not discard a session after server or network errors", () => {
        expect(isConfirmedAuthenticationFailure(
            new JellyfinApiError(503, "/Users/user/Items")
        )).toBeFalse();
        expect(isConfirmedAuthenticationFailure(new TypeError("Network unavailable"))).toBeFalse();
    });
});
