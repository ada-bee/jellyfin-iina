import { setupFixturePreview } from "./fixtureRuntime";
import { installIinaStub } from "./iinaStub";
import { setupLivePreview } from "./liveRuntime";

export function startPreview(): void {
    installIinaStub(window);
    if (new URLSearchParams(window.location.search).get("source") === "live") {
        setupLivePreview();
        return;
    }
    setupFixturePreview();
}
