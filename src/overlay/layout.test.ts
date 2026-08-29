import { describe, expect, test } from "bun:test";

import { calculateBackdropLayout } from "./layout";

describe("backdrop layout", () => {
    test("fits the centered 6% side crop flush beside the sidebar", () => {
        const layout = calculateBackdropLayout(1920, 1080, 360);

        expect(layout.sidebarWidth).toBe(360);
        expect(layout.imageWidth).toBeCloseTo(1560);
    });

    test("limits the image by height in a wide window", () => {
        expect(calculateBackdropLayout(2560, 1080, 360).imageWidth).toBeCloseTo(1689.6);
    });

    test("stays valid when the sidebar consumes a narrow window", () => {
        expect(calculateBackdropLayout(285, 120, 360)).toEqual({
            imageWidth: 1,
            sidebarWidth: 285
        });
    });
});
