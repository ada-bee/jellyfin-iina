import type { LoadedBackdrop, OverlayView } from "./controller";

export interface OverlayDomView extends OverlayView {
    onSkipRequested(handler: () => void): void;
}

export function createOverlayDomView(document: Document): OverlayDomView {
    const backdrop = getRequiredElement<HTMLElement>(document, "backdrop-preview");
    const layers = Array.from(document.querySelectorAll<HTMLImageElement>(".backdrop-image"));
    const skipButton = getRequiredElement<HTMLButtonElement>(document, "skip-button");
    if (layers.length !== 2) {
        throw new Error(`Expected two backdrop image layers, found ${layers.length}`);
    }

    let activeLayerIndex = 0;
    let displayedUrl = "";

    return {
        hideBackdrop: () => backdrop.classList.remove("visible"),

        loadBackdrop(url, onLoad, onError) {
            const activeLayer = layers[activeLayerIndex];
            if (displayedUrl === url && activeLayer.complete && Boolean(activeLayer.naturalWidth)) {
                onLoad({ display: () => undefined });
                return;
            }

            const nextLayerIndex = activeLayerIndex === 0 ? 1 : 0;
            const nextLayer = layers[nextLayerIndex];
            nextLayer.onload = () => {
                onLoad(createLoadedBackdrop(url, nextLayerIndex));
            };
            nextLayer.onerror = onError;
            nextLayer.classList.remove("active");
            nextLayer.src = url;
        },

        onSkipRequested(handler) {
            skipButton.addEventListener("click", handler);
        },

        preloadBackdrop(url) {
            const image = new Image();
            image.src = url;
        },

        setBackdropVisible: () => backdrop.classList.add("visible"),

        setSkipButton(label) {
            skipButton.textContent = label;
            skipButton.classList.toggle("hidden", !label);
        }
    };

    function createLoadedBackdrop(url: string, layerIndex: number): LoadedBackdrop {
        return {
            display() {
                layers[activeLayerIndex].classList.remove("active");
                layers[layerIndex].classList.add("active");
                activeLayerIndex = layerIndex;
                displayedUrl = url;
            }
        };
    }
}

function getRequiredElement<ElementType extends HTMLElement>(document: Document, id: string): ElementType {
    const element = document.getElementById(id);
    if (!element) {
        throw new Error(`Missing overlay element #${id}`);
    }
    return element as ElementType;
}
