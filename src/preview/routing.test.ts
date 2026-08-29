import { describe, expect, test } from "bun:test";

import { createPreviewUrl, getRequestedPreview, isPreviewName } from "./routing";

describe("sidebar preview routing", () => {
    test("accepts only supported fixture states", () => {
        expect(getRequestedPreview("?state=series")).toBe("series");
        expect(getRequestedPreview("?state=episodes")).toBe("home");
        expect(getRequestedPreview("")).toBe("home");
        expect(isPreviewName("movie")).toBeTrue();
        expect(isPreviewName("live")).toBeFalse();
    });

    test("changes fixture state without discarding other preview options", () => {
        const url = createPreviewUrl("http://localhost:4173/?source=fixture&state=home", "error");
        expect(url.searchParams.get("source")).toBe("fixture");
        expect(url.searchParams.get("state")).toBe("error");
    });
});
