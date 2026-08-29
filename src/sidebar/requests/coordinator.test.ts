import { describe, expect, test } from "bun:test";

import { LatestRequest, RequestCache } from "./coordinator";

describe("sidebar request coordination", () => {
    test("accepts only the latest request token", () => {
        const requests = new LatestRequest();
        const first = requests.begin();
        const second = requests.begin();

        expect(requests.isCurrent(first)).toBeFalse();
        expect(requests.isCurrent(second)).toBeTrue();
        requests.cancel();
        expect(requests.isCurrent(second)).toBeFalse();
    });

    test("keeps cache ownership explicit", () => {
        const cache = new RequestCache<number>();
        cache.set("session\u0000home", 1);
        expect(cache.get("session\u0000home")).toBe(1);
        cache.clear();
        expect(cache.get("session\u0000home")).toBeUndefined();
    });
});
