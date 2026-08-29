import type { Clock } from "../../playback/ports";

export class IinaClock implements Clock {
    setInterval(callback: () => void, intervalMs: number): unknown {
        return setInterval(callback, intervalMs);
    }

    clearInterval(handle: unknown): void {
        clearInterval(handle as ReturnType<typeof setInterval>);
    }

    setTimeout(callback: () => void, delayMs: number): unknown {
        return setTimeout(callback, delayMs);
    }

    clearTimeout(handle: unknown): void {
        clearTimeout(handle as ReturnType<typeof setTimeout>);
    }
}
