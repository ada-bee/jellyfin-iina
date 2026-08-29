import { ui } from "../dom";

let libraryGridObserver: IntersectionObserver | null = null;
let libraryGridLoadMore: (() => void) | null = null;

export function replaceContent(...nodes: Array<Node | string>): void {
    resetLibraryGrid();
    ui.content.classList.remove("library-content");
    ui.content.replaceChildren(...nodes);
}

export function resetLibraryGrid(): void {
    disconnectLibraryGridObserver();
    libraryGridLoadMore = null;
}

export function setLibraryGridLoadMore(onLoadMore: () => void): void {
    libraryGridLoadMore = onLoadMore;
}

export function updateLibraryLoadStatus(hasMore: boolean): void {
    disconnectLibraryGridObserver();
    ui.content.querySelector("[data-library-load-status]")?.remove();
    if (!hasMore || !libraryGridLoadMore) {
        return;
    }

    const status = getOrCreateLibraryLoadStatus();
    requestAnimationFrame(() => requestAnimationFrame(() => {
        if (status.isConnected && libraryGridLoadMore) {
            observeLibraryLoadStatus(status);
        }
    }));
}

export function getOrCreateLibraryLoadStatus(): HTMLElement {
    const existing = ui.content.querySelector<HTMLElement>("[data-library-load-status]");
    if (existing) {
        return existing;
    }
    const status = document.createElement("div");
    status.className = "library-load-status";
    status.dataset.libraryLoadStatus = "";
    status.setAttribute("role", "status");
    status.setAttribute("aria-label", "Loading more titles");
    status.appendChild(buildLibraryLoadingSpinner());
    ui.content.appendChild(status);
    return status;
}

export function buildLibraryLoadingSpinner(): HTMLElement {
    const spinner = document.createElement("span");
    spinner.className = "library-loading-spinner";
    spinner.setAttribute("aria-hidden", "true");
    return spinner;
}

export function disconnectLibraryGridObserver(): void {
    libraryGridObserver?.disconnect();
    libraryGridObserver = null;
}

function observeLibraryLoadStatus(status: HTMLElement): void {
    if (!libraryGridLoadMore) {
        return;
    }
    libraryGridObserver = new IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting)) {
            libraryGridLoadMore?.();
        }
    }, { rootMargin: "360px 0px" });
    libraryGridObserver.observe(status);
}
