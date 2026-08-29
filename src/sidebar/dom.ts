function getElement<T extends HTMLElement>(id: string): T {
    const element = document.getElementById(id);
    if (!element) {
        throw new Error(`Missing element: ${id}`);
    }
    return element as T;
}

export const ui = {
    loginView: getElement<HTMLDivElement>("login-view"),
    browseView: getElement<HTMLDivElement>("browse-view"),
    loginForm: getElement<HTMLFormElement>("login-form"),
    loginError: getElement<HTMLDivElement>("login-error"),
    connectBtn: getElement<HTMLButtonElement>("connect-btn"),
    backBtn: getElement<HTMLButtonElement>("back-btn"),
    navigationLayer: getElement<HTMLElement>("navigation-layer"),
    sectionHeader: getElement<HTMLDivElement>("section-header"),
    sectionTitle: getElement<HTMLSpanElement>("section-title"),
    content: getElement<HTMLDivElement>("content"),
    loading: getElement<HTMLDivElement>("loading"),
    errorState: getElement<HTMLDivElement>("error-state"),
    errorMessage: getElement<HTMLParagraphElement>("error-message"),
    bottomSearchLayer: getElement<HTMLDivElement>("bottom-search-layer"),
    searchFilters: getElement<HTMLDivElement>("search-filters"),
    searchInput: getElement<HTMLInputElement>("search-input"),
    clearSearchButton: getElement<HTMLButtonElement>("clear-search"),
    retryBtn: getElement<HTMLButtonElement>("retry-btn"),
    serverUrlInput: getElement<HTMLInputElement>("server-url"),
    usernameInput: getElement<HTMLInputElement>("username"),
    passwordInput: getElement<HTMLInputElement>("password")
};
