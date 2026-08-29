import type { JellyfinBaseItem } from "../../jellyfin/types";
import { setBackdropSlideshow } from "../backdropContext";
import { ui } from "../dom";
import { buildListCardElement, getLibraryPosterOptions } from "./cards";
import {
    buildLibraryLoadingSpinner,
    disconnectLibraryGridObserver,
    getOrCreateLibraryLoadStatus,
    replaceContent,
    setLibraryGridLoadMore,
    updateLibraryLoadStatus
} from "./content";

export function renderLibraryGrid(
    items: JellyfinBaseItem[],
    hasMore: boolean,
    onLoadMore: () => void
): void {
    const grid = document.createElement("div");
    grid.className = "library-poster-grid";
    grid.dataset.libraryGrid = "";
    items.forEach(item => grid.appendChild(buildListCardElement(item, getLibraryPosterOptions())));

    replaceContent(grid);
    setBackdropSlideshow(items);
    setLibraryGridLoadMore(onLoadMore);
    ui.content.classList.add("library-content");
    updateLibraryLoadStatus(hasMore);
}

export function appendLibraryGridItems(items: JellyfinBaseItem[], hasMore: boolean): void {
    const grid = ui.content.querySelector<HTMLElement>("[data-library-grid]");
    if (!grid) {
        return;
    }
    const fragment = document.createDocumentFragment();
    items.forEach(item => fragment.appendChild(buildListCardElement(item, getLibraryPosterOptions())));
    grid.appendChild(fragment);
    updateLibraryLoadStatus(hasMore);
}

export function showLibraryGridLoadError(onRetry: () => void): void {
    disconnectLibraryGridObserver();
    const status = getOrCreateLibraryLoadStatus();
    status.classList.add("library-load-status--error");
    status.removeAttribute("role");
    status.removeAttribute("aria-label");
    const retry = document.createElement("button");
    retry.className = "btn-secondary library-load-retry";
    retry.type = "button";
    retry.textContent = "Try Again";
    retry.addEventListener("click", () => {
        status.replaceChildren(buildLibraryLoadingSpinner());
        status.classList.remove("library-load-status--error");
        status.setAttribute("role", "status");
        status.setAttribute("aria-label", "Loading more titles");
        onRetry();
    });
    status.replaceChildren(retry);
}
