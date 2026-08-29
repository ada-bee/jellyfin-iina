import type { LoadedBackdrop, OverlayView } from "./controller";
import { averagePixelColor, toCssColor } from "./color";
import { calculateBackdropLayout } from "./layout";

const DEFAULT_BACKDROP_COLOR = "rgb(16, 16, 16)";
const SAMPLE_WIDTH = 32;
const SAMPLE_HEIGHT = 18;

export interface OverlayDomView extends OverlayView {
    onSkipRequested(handler: () => void): void;
}

export function createOverlayDomView(document: Document): OverlayDomView {
    const backdrop = getRequiredElement<HTMLElement>(document, "backdrop-preview");
    const layers = Array.from(document.querySelectorAll<HTMLElement>(".backdrop-layer"));
    const skipButton = getRequiredElement<HTMLButtonElement>(document, "skip-button");
    if (layers.length !== 2) {
        throw new Error(`Expected two backdrop image layers, found ${layers.length}`);
    }

    let activeLayerIndex = 0;
    let displayedUrl = "";
    let sidebarWidth = 0;
    const averageColors = new Map<string, string>();
    const updateBackdropLayout = () => applyBackdropLayout(document, backdrop, sidebarWidth);
    document.defaultView?.addEventListener("resize", updateBackdropLayout, { passive: true });
    updateBackdropLayout();

    return {
        hideBackdrop: () => backdrop.classList.remove("visible"),

        loadBackdrop(url, onLoad, onError) {
            const activeImage = getLayerImage(layers[activeLayerIndex], ".backdrop-image");
            if (displayedUrl === url && activeImage.complete && Boolean(activeImage.naturalWidth)) {
                onLoad({ display: () => undefined });
                return;
            }

            const nextLayerIndex = activeLayerIndex === 0 ? 1 : 0;
            const nextLayer = layers[nextLayerIndex];
            const nextImage = getLayerImage(nextLayer, ".backdrop-image");
            const ambientImage = getLayerImage(nextLayer, ".backdrop-ambient");
            nextLayer.classList.remove("active");
            ambientImage.src = url;
            loadImageForSampling(nextImage, url, () => {
                const color = averageColors.get(url) || sampleAverageColor(document, nextImage);
                if (color) {
                    averageColors.set(url, color);
                }
                onLoad(createLoadedBackdrop(url, nextLayerIndex, color || DEFAULT_BACKDROP_COLOR));
            }, onError);
        },

        onSkipRequested(handler) {
            skipButton.addEventListener("click", handler);
        },

        preloadBackdrop(url) {
            const image = new Image();
            image.src = url;
        },

        setBackdropVisible: () => backdrop.classList.add("visible"),

        setSidebarWidth(width) {
            sidebarWidth = Math.max(0, width);
            updateBackdropLayout();
        },

        setSkipButton(label) {
            skipButton.textContent = label;
            skipButton.classList.toggle("hidden", !label);
        }
    };

    function createLoadedBackdrop(url: string, layerIndex: number, color: string): LoadedBackdrop {
        return {
            display() {
                layers[activeLayerIndex].classList.remove("active");
                layers[layerIndex].style.setProperty("--backdrop-color", color);
                layers[layerIndex].classList.add("active");
                activeLayerIndex = layerIndex;
                displayedUrl = url;
            }
        };
    }
}

function applyBackdropLayout(
    document: Document,
    backdrop: HTMLElement,
    requestedSidebarWidth: number
): void {
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = document.documentElement.clientHeight;
    const layout = calculateBackdropLayout(viewportWidth, viewportHeight, requestedSidebarWidth);

    backdrop.style.setProperty("--sidebar-width", `${layout.sidebarWidth}px`);
    backdrop.style.setProperty("--backdrop-width", `${layout.imageWidth}px`);
}

function getLayerImage(layer: HTMLElement, selector: string): HTMLImageElement {
    const image = layer.querySelector<HTMLImageElement>(selector);
    if (!image) {
        throw new Error(`Missing overlay image ${selector}`);
    }
    return image;
}

function loadImageForSampling(
    image: HTMLImageElement,
    url: string,
    onLoad: () => void,
    onError: () => void
): void {
    image.onload = onLoad;
    image.onerror = () => {
        if (image.crossOrigin !== null) {
            image.crossOrigin = null;
            image.onerror = onError;
            image.src = url;
            return;
        }
        onError();
    };
    image.crossOrigin = "anonymous";
    image.src = url;
}

function sampleAverageColor(document: Document, image: HTMLImageElement): string | null {
    try {
        const canvas = document.createElement("canvas");
        canvas.width = SAMPLE_WIDTH;
        canvas.height = SAMPLE_HEIGHT;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) {
            return null;
        }
        context.drawImage(image, 0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT);
        const color = averagePixelColor(
            context.getImageData(0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT).data
        );
        return color ? toCssColor(color) : null;
    } catch {
        return null;
    }
}

function getRequiredElement<ElementType extends HTMLElement>(document: Document, id: string): ElementType {
    const element = document.getElementById(id);
    if (!element) {
        throw new Error(`Missing overlay element #${id}`);
    }
    return element as ElementType;
}
