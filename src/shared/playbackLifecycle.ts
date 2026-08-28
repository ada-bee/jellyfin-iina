export interface StoppedPlayback<T> {
    playback: T;
    positionTicks: number;
}

interface IdlePlayback {
    status: "idle";
}

interface ActivePlayback<T> {
    status: "active";
    playback: T;
    lastKnownPositionTicks: number;
}

type PlaybackLifecycleState<T> = IdlePlayback | ActivePlayback<T>;

export class PlaybackLifecycle<T> {
    private state: PlaybackLifecycleState<T> = { status: "idle" };

    get current(): T | null {
        return this.state.status === "active" ? this.state.playback : null;
    }

    start(playback: T): void {
        if (this.state.status === "active") {
            throw new Error("Cannot start playback while another session is active.");
        }
        this.state = {
            status: "active",
            playback,
            lastKnownPositionTicks: 0
        };
    }

    updatePosition(positionTicks: number): void {
        if (this.state.status === "active" && positionTicks > 0) {
            this.state.lastKnownPositionTicks = positionTicks;
        }
    }

    stop(positionTicks: number): StoppedPlayback<T> | null {
        if (this.state.status === "idle") {
            return null;
        }

        const active = this.state;
        this.state = { status: "idle" };
        const stopped = {
            playback: active.playback,
            positionTicks: positionTicks || active.lastKnownPositionTicks || 0
        };
        return stopped;
    }
}
