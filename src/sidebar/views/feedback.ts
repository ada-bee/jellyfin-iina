export function buildFeedbackState(titleText: string, detailText: string): HTMLElement {
    const feedback = document.createElement("div");
    feedback.className = "feedback-state feedback-state--inline";

    const icon = document.createElement("div");
    icon.className = "feedback-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.innerHTML = '<svg width="34" height="34" viewBox="0 0 34 34" fill="none"><circle cx="14" cy="14" r="8.5" stroke="currentColor" stroke-width="1.5"/><path d="m20.5 20.5 6 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';

    const title = document.createElement("h3");
    title.textContent = titleText;
    feedback.append(icon, title);
    if (detailText) {
        const detail = document.createElement("p");
        detail.textContent = detailText;
        feedback.appendChild(detail);
    }
    return feedback;
}

export function getEmptyStateDetail(message: string): string {
    return message.toLowerCase().includes("result")
        ? "Try a different title or change the filter."
        : "";
}
