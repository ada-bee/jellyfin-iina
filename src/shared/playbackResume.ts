interface ResumeRequest {
    playSessionId: string;
    seconds: number;
}

export interface ResumeTimer {
    schedule: (callback: () => void, delayMs: number) => unknown;
    cancel: (handle: unknown) => void;
}

const defaultTimer: ResumeTimer = {
    schedule: (callback, delayMs) => setTimeout(callback, delayMs),
    cancel: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>)
};

export class PlaybackResumeCoordinator {
    private pending: ResumeRequest | null = null;
    private timerHandle: unknown | null = null;

    constructor(private readonly timer: ResumeTimer = defaultTimer) {}

    request(playSessionId: string, seconds: number): void {
        this.cancel();
        if (playSessionId && Number.isFinite(seconds) && seconds > 0) {
            this.pending = { playSessionId, seconds };
        }
    }

    activate(
        playSessionId: string,
        delayMs: number,
        isActive: (playSessionId: string) => boolean,
        seek: (seconds: number) => void
    ): boolean {
        if (!this.pending || this.pending.playSessionId !== playSessionId) {
            return false;
        }

        const request = this.pending;
        this.pending = null;
        this.timerHandle = this.timer.schedule(() => {
            this.timerHandle = null;
            if (isActive(request.playSessionId)) {
                seek(request.seconds);
            }
        }, delayMs);
        return true;
    }

    cancel(): void {
        this.pending = null;
        if (this.timerHandle !== null) {
            this.timer.cancel(this.timerHandle);
            this.timerHandle = null;
        }
    }
}
