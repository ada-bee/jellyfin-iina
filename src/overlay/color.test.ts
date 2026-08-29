import { describe, expect, test } from "bun:test";

import { averagePixelColor, toCssColor } from "./color";

describe("backdrop average colour", () => {
    test("averages opaque pixels", () => {
        const color = averagePixelColor(new Uint8ClampedArray([
            20, 40, 60, 255,
            100, 120, 140, 255
        ]));

        expect(color).toEqual({ red: 60, green: 80, blue: 100 });
        expect(color && toCssColor(color)).toBe("rgb(60, 80, 100)");
    });

    test("weights transparent pixels and rejects an empty image", () => {
        expect(averagePixelColor(new Uint8ClampedArray([
            200, 100, 50, 255,
            0, 0, 0, 0
        ]))).toEqual({ red: 200, green: 100, blue: 50 });
        expect(averagePixelColor(new Uint8ClampedArray())).toBeNull();
    });
});
