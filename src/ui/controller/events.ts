import { ui } from "../dom";
import { cancelScheduledBackdropPreview, scheduleBackdropPreview } from "../backdropPreview";
import { findListCard, getCardContext, handleContentError } from "../render";
import { state } from "../state";
import { playItem } from "../playback";
import {
    handleBack,
    handleClearSearch,
    handleRefresh,
    handleRetry,
    handleSearchInput,
    handleSearchSubmit
} from "./navigation";
import { handleLogin, handleLogout } from "./session";
import { loadEpisodes, loadSeasons } from "./loaders";

export function setupEventListeners(): void {
    ui.loginForm.addEventListener("submit", handleLogin);
    ui.backBtn.addEventListener("click", handleBack);
    ui.logoutBtn.addEventListener("click", handleLogout);
    ui.refreshBtn.addEventListener("click", handleRefresh);
    ui.retryBtn.addEventListener("click", handleRetry);
    ui.searchInput.addEventListener("input", handleSearchInput);
    ui.searchInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            handleSearchSubmit(event);
        }
    });
    ui.clearSearchButton.addEventListener("click", handleClearSearch);
    ui.content.addEventListener("click", handleContentClick);
    ui.content.addEventListener("keydown", handleContentKeydown);
    ui.content.addEventListener("pointerover", handleContentPointerOver);
    ui.content.addEventListener("pointerout", handleContentPointerOut);
    ui.content.addEventListener("focusin", handleContentFocusIn);
    ui.content.addEventListener("focusout", handleContentFocusOut);
    ui.content.addEventListener("error", handleContentError, true);
}

function handleContentPointerOut(event: PointerEvent): void {
    const card = findListCard(event.target);
    const nextCard = findListCard(event.relatedTarget);
    if (card && card !== nextCard) {
        cancelScheduledBackdropPreview();
    }
}

function handleContentPointerOver(event: PointerEvent): void {
    const card = findListCard(event.target);
    const previousCard = findListCard(event.relatedTarget);
    if (!card || card === previousCard || !ui.content.contains(card)) {
        return;
    }
    scheduleBackdropPreview(card);
}

function handleContentFocusIn(event: FocusEvent): void {
    const card = findListCard(event.target);
    if (!card || !ui.content.contains(card)) {
        return;
    }
    scheduleBackdropPreview(card);
}

function handleContentFocusOut(event: FocusEvent): void {
    const card = findListCard(event.target);
    const nextCard = findListCard(event.relatedTarget);
    if (card && card !== nextCard) {
        cancelScheduledBackdropPreview();
    }
}

function handleContentClick(event: MouseEvent): void {
    const card = findListCard(event.target);
    if (!card || !ui.content.contains(card)) {
        return;
    }

    handleListCardSelection(card);
}

function handleContentKeydown(event: KeyboardEvent): void {
    if (event.key !== "Enter" && event.key !== " ") {
        return;
    }

    const card = findListCard(event.target);
    if (!card || !ui.content.contains(card)) {
        return;
    }

    event.preventDefault();
    handleListCardSelection(card);
}

function handleListCardSelection(card: HTMLElement): void {
    const details = getCardContext(card);
    if (!details || !details.id) {
        return;
    }

    const { id, name, type, resume, context } = details;

    if (type === "Series") {
        void loadSeasons(id, name);
        return;
    }

    if (type === "Season") {
        void loadEpisodes(state.currentSeries?.id || "", id, name);
        return;
    }

    void playItem(id, name, resume, context);
}
