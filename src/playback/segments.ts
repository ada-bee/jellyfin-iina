import { TICKS_PER_SECOND } from "../shared/constants";

export interface NormalizedSegment {
    type: "Intro" | "Outro";
    startSeconds: number | null;
    endSeconds: number | null;
}

export interface SegmentBounds {
    Type?: string;
    StartTicks?: number | null;
    EndTicks?: number | null;
}

export function normalizeSegments(
    segments: SegmentBounds[],
    runtimeTicks: number,
    fallbackDurationSeconds: number
): NormalizedSegment[] {
    const runtimeSeconds = runtimeTicks > 0 ? runtimeTicks / TICKS_PER_SECOND : 0;
    const resolvedRuntime = runtimeSeconds || Math.max(0, fallbackDurationSeconds);

    return segments.flatMap((segment) => {
        const type = segment.Type === "Intro" || segment.Type === "Outro" ? segment.Type : null;
        if (!type) {
            return [];
        }

        let startSeconds = typeof segment.StartTicks === "number"
            ? segment.StartTicks / TICKS_PER_SECOND
            : null;
        let endSeconds = typeof segment.EndTicks === "number"
            ? segment.EndTicks / TICKS_PER_SECOND
            : null;

        if (type === "Intro" && startSeconds === null && endSeconds !== null) {
            startSeconds = 0;
        }
        if (type === "Outro" && endSeconds === null && resolvedRuntime > 0) {
            endSeconds = resolvedRuntime;
        }

        return [{ type, startSeconds, endSeconds }];
    });
}

export function getActiveSegment(
    positionSeconds: number,
    segments: NormalizedSegment[]
): NormalizedSegment | null {
    const activeSegments = segments.filter((segment) => (
        segment.startSeconds !== null
        && segment.endSeconds !== null
        && positionSeconds >= segment.startSeconds
        && positionSeconds < segment.endSeconds
    ));

    return activeSegments.find((segment) => segment.type === "Intro")
        || activeSegments[0]
        || null;
}

export function shouldShowSkipOverlay(segment: NormalizedSegment | null): boolean {
    return Boolean(
        segment
        && segment.startSeconds !== null
        && segment.endSeconds !== null
        && segment.endSeconds > segment.startSeconds
    );
}
