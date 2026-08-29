import { describe, expect, test } from "bun:test";

import { getActiveSegment, normalizeSegments, shouldShowSkipOverlay } from "./segments";

const TICKS_PER_SECOND = 10_000_000;

describe("media segment handling", () => {
    test("fills a missing intro start from the beginning", () => {
        expect(normalizeSegments([
            { Type: "Intro", EndTicks: 90 * TICKS_PER_SECOND }
        ], 0, 0)).toEqual([{
            type: "Intro",
            startSeconds: 0,
            endSeconds: 90
        }]);
    });

    test("fills a missing outro end from the negotiated runtime", () => {
        expect(normalizeSegments([
            { Type: "Outro", StartTicks: 1200 * TICKS_PER_SECOND }
        ], 1320 * TICKS_PER_SECOND, 1300)).toEqual([{
            type: "Outro",
            startSeconds: 1200,
            endSeconds: 1320
        }]);
    });

    test("uses player duration when Jellyfin has no runtime", () => {
        expect(normalizeSegments([
            { Type: "Outro", StartTicks: 1200 * TICKS_PER_SECOND }
        ], 0, 1300)[0]?.endSeconds).toBe(1300);
    });

    test("uses half-open boundaries and prefers an overlapping intro", () => {
        const segments = normalizeSegments([
            { Type: "Outro", StartTicks: 80 * TICKS_PER_SECOND, EndTicks: 100 * TICKS_PER_SECOND },
            { Type: "Intro", StartTicks: 90 * TICKS_PER_SECOND, EndTicks: 110 * TICKS_PER_SECOND }
        ], 0, 0);

        expect(getActiveSegment(90, segments)?.type).toBe("Intro");
        expect(getActiveSegment(110, segments)).toBeNull();
    });

    test("rejects empty or reversed skip ranges", () => {
        expect(shouldShowSkipOverlay({
            type: "Intro",
            startSeconds: 30,
            endSeconds: 30
        })).toBe(false);
        expect(shouldShowSkipOverlay(null)).toBe(false);
    });
});
