import { describe, expect, test } from "bun:test";

import {
    createOverlayController,
    type LoadedBackdrop,
    type OverlayScheduler,
    type OverlayView
} from "./controller";

class FakeScheduler implements OverlayScheduler {
    private nextHandle = 0;
    readonly timers = new Map<number, () => void>();

    setTimeout(callback: () => void): number {
        const handle = this.nextHandle;
        this.nextHandle += 1;
        this.timers.set(handle, callback);
        return handle;
    }

    clearTimeout(handle: unknown): void {
        this.timers.delete(handle as number);
    }

    runNext(): void {
        const entry = this.timers.entries().next().value as [number, () => void] | undefined;
        if (!entry) {
            throw new Error("No timer was scheduled");
        }
        this.timers.delete(entry[0]);
        entry[1]();
    }
}

class FakeView implements OverlayView {
    readonly loads: Array<{
        url: string;
        loaded: (backdrop: LoadedBackdrop) => void;
        failed: () => void;
    }> = [];
    readonly displayed: string[] = [];
    readonly preloaded: string[] = [];
    readonly skipLabels: string[] = [];
    hiddenCount = 0;
    visibleCount = 0;

    hideBackdrop(): void {
        this.hiddenCount += 1;
    }

    loadBackdrop(
        url: string,
        onLoad: (backdrop: LoadedBackdrop) => void,
        onError: () => void
    ): void {
        this.loads.push({ url, loaded: onLoad, failed: onError });
    }

    preloadBackdrop(url: string): void {
        this.preloaded.push(url);
    }

    setBackdropVisible(): void {
        this.visibleCount += 1;
    }

    setSkipButton(label: string): void {
        this.skipLabels.push(label);
    }

    succeed(index: number): void {
        const load = this.loads[index];
        load.loaded({ display: () => this.displayed.push(load.url) });
    }
}

function setup() {
    const scheduler = new FakeScheduler();
    const view = new FakeView();
    let skipRequests = 0;
    const controller = createOverlayController({
        scheduler,
        view,
        onSkipRequested: () => {
            skipRequests += 1;
        },
        slideshowIntervalMs: 20
    });
    return { controller, scheduler, view, getSkipRequests: () => skipRequests };
}

describe("overlay controller", () => {
    test("cycles the eligible playlist and preloads the following image", () => {
        const { controller, scheduler, view } = setup();
        controller.setBackdrops({ playlistUrls: ["one", "two"], overrideUrl: "", eligible: true });

        expect(view.loads.map(load => load.url)).toEqual(["one"]);
        view.succeed(0);
        expect(view.displayed).toEqual(["one"]);
        expect(view.preloaded).toEqual(["two"]);
        expect(scheduler.timers.size).toBe(1);

        scheduler.runNext();
        expect(view.loads.map(load => load.url)).toEqual(["one", "two"]);
        view.succeed(1);
        expect(view.displayed).toEqual(["one", "two"]);
        expect(view.preloaded).toEqual(["two", "one"]);
    });

    test("shows an override and advances the playlist when it ends", () => {
        const { controller, scheduler, view } = setup();
        controller.setBackdrops({ playlistUrls: ["one", "two"], overrideUrl: "", eligible: true });
        view.succeed(0);

        controller.setBackdrops({ playlistUrls: ["one", "two"], overrideUrl: "detail", eligible: true });
        expect(scheduler.timers.size).toBe(0);
        expect(view.loads.at(-1)?.url).toBe("detail");
        view.succeed(1);

        controller.setBackdrops({ playlistUrls: ["one", "two"], overrideUrl: "", eligible: true });
        expect(view.loads.at(-1)?.url).toBe("two");
    });

    test("falls back through the playlist when an override or image fails", () => {
        const { controller, view } = setup();
        controller.setBackdrops({ playlistUrls: ["one", "two"], overrideUrl: "detail", eligible: true });

        view.loads[0].failed();
        expect(view.loads.at(-1)?.url).toBe("one");
        view.loads[1].failed();
        expect(view.loads.at(-1)?.url).toBe("two");
        view.loads[2].failed();
        expect(view.hiddenCount).toBe(1);
    });

    test("ignores stale image completion after becoming ineligible", () => {
        const { controller, scheduler, view } = setup();
        controller.setBackdrops({ playlistUrls: ["one", "two"], overrideUrl: "", eligible: true });
        controller.setBackdrops({ playlistUrls: ["one", "two"], overrideUrl: "", eligible: false });

        view.succeed(0);
        expect(view.displayed).toEqual([]);
        expect(view.visibleCount).toBe(0);
        expect(view.hiddenCount).toBe(1);
        expect(scheduler.timers.size).toBe(0);
    });

    test("owns skip label state and forwards skip requests", () => {
        const { controller, view, getSkipRequests } = setup();
        controller.setSkipButton({ label: "Skip Intro" });
        controller.setSkipButton({ label: "Skip Intro" });
        controller.setSkipButton({ label: "" });
        controller.requestSkip();

        expect(view.skipLabels).toEqual(["Skip Intro", ""]);
        expect(getSkipRequests()).toBe(1);
    });
});
