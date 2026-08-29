import { clearBackdropContext } from "../backdropContext";
import { ui } from "../dom";
import { state } from "../store";
import { disconnectLibraryGridObserver, replaceContent } from "./content";
import { buildFeedbackState, getEmptyStateDetail } from "./feedback";

export function showLoginView(): void {
    clearBackdropContext();
    ui.loginView.classList.remove("hidden");
    ui.browseView.classList.add("hidden");
}

export function showBrowseView(): void {
    ui.loginView.classList.add("hidden");
    ui.browseView.classList.remove("hidden");
}

export function showLoading(): void {
    disconnectLibraryGridObserver();
    ui.loading.classList.remove("hidden");
    ui.content.classList.add("hidden");
    ui.errorState.classList.add("hidden");
}

export function hideLoading(): void {
    ui.loading.classList.add("hidden");
    ui.errorState.classList.add("hidden");
    ui.content.classList.remove("hidden");
}

export function renderEmptyState(message: string): void {
    replaceContent(buildFeedbackState(message, getEmptyStateDetail(message)));
}

export function showError(message: string): void {
    ui.loading.classList.add("hidden");
    ui.content.classList.add("hidden");
    ui.errorState.classList.remove("hidden");
    ui.errorMessage.textContent = message;
}

export function updateTitle(title: string): void {
    ui.sectionTitle.textContent = title;
    ui.backBtn.setAttribute("aria-label", `Back from ${title}`);
    ui.backBtn.title = `Back from ${title}`;

    const showHome = title === "Home" && state.breadcrumb.length === 0 && !state.searchQuery;
    const showSearchFilters = title === "Search Results" && Boolean(state.searchQuery);
    const showSectionHeader = !showHome && !showSearchFilters;
    const canGoBack = state.breadcrumb.length > 0;

    ui.searchFilters.classList.toggle("hidden", !showSearchFilters);
    ui.navigationLayer.classList.toggle("hidden", !showSectionHeader);
    ui.sectionHeader.classList.toggle("hidden", !showSectionHeader);
    ui.backBtn.classList.toggle("hidden", !canGoBack);
    ui.browseView.classList.toggle("home-view", showHome);
    ui.browseView.classList.toggle("searching", showSearchFilters);
}
