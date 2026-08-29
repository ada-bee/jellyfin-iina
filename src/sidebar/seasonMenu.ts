type SeasonSelectionHandler = (seasonId: string) => void;

const selectorQuery = "[data-season-selector]";
const triggerQuery = "[data-season-menu-trigger]";
const optionQuery = "[data-season-option]";
const labelQuery = "[data-season-menu-label]";

let listenersInstalled = false;
let selectionHandler: SeasonSelectionHandler | null = null;
let labelUpdateFrame: number | null = null;

export function setupSeasonMenu(onSelect: SeasonSelectionHandler): void {
    selectionHandler = onSelect;
    if (listenersInstalled) {
        return;
    }
    listenersInstalled = true;
    document.addEventListener("click", handleDocumentClick);
    document.addEventListener("keydown", handleDocumentKeydown);
    window.addEventListener("resize", scheduleSeasonMenuLabelUpdate, { passive: true });
}

export function scheduleSeasonMenuLabelUpdate(): void {
    updateSeasonMenuLabels();
    if (labelUpdateFrame !== null) {
        cancelAnimationFrame(labelUpdateFrame);
    }
    labelUpdateFrame = requestAnimationFrame(() => {
        labelUpdateFrame = null;
        updateSeasonMenuLabels();
    });
}

function updateSeasonMenuLabels(): void {
    document.querySelectorAll<HTMLElement>(labelQuery).forEach(label => {
        label.classList.toggle(
            "season-selector-label--truncated",
            label.scrollWidth > label.clientWidth + 1
        );
    });
}

function handleDocumentClick(event: MouseEvent): void {
    const target = event.target instanceof Element ? event.target : null;
    const option = target?.closest<HTMLButtonElement>(optionQuery);
    if (option) {
        const seasonId = option.dataset.seasonOption;
        if (!seasonId) {
            return;
        }
        closeSeasonMenus();
        selectionHandler?.(seasonId);
        window.setTimeout(() => {
            document.querySelector<HTMLButtonElement>(triggerQuery)?.focus();
        }, 0);
        return;
    }

    const trigger = target?.closest<HTMLButtonElement>(triggerQuery);
    if (trigger) {
        const selector = trigger.closest<HTMLElement>(selectorQuery);
        if (!selector) {
            return;
        }
        const shouldOpen = trigger.getAttribute("aria-expanded") !== "true";
        closeSeasonMenus(selector);
        setSeasonMenuOpen(selector, shouldOpen, shouldOpen ? "selected" : null);
        return;
    }

    closeSeasonMenus();
}

function handleDocumentKeydown(event: KeyboardEvent): void {
    const target = event.target instanceof Element ? event.target : null;
    const trigger = target?.closest<HTMLButtonElement>(triggerQuery);
    if (trigger) {
        handleTriggerKeydown(event, trigger);
        return;
    }

    const option = target?.closest<HTMLButtonElement>(optionQuery);
    if (option) {
        handleOptionKeydown(event, option);
    }
}

function handleTriggerKeydown(event: KeyboardEvent, trigger: HTMLButtonElement): void {
    const selector = trigger.closest<HTMLElement>(selectorQuery);
    if (!selector) {
        return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        closeSeasonMenus(selector);
        setSeasonMenuOpen(selector, true, event.key === "ArrowDown" ? "selected" : "last");
    } else if (event.key === "Escape") {
        event.preventDefault();
        setSeasonMenuOpen(selector, false);
    }
}

function handleOptionKeydown(event: KeyboardEvent, option: HTMLButtonElement): void {
    const selector = option.closest<HTMLElement>(selectorQuery);
    if (!selector) {
        return;
    }
    const options = Array.from(selector.querySelectorAll<HTMLButtonElement>(optionQuery));
    const currentIndex = options.indexOf(option);

    if (event.key === "Escape") {
        event.preventDefault();
        setSeasonMenuOpen(selector, false);
        selector.querySelector<HTMLButtonElement>(triggerQuery)?.focus();
        return;
    }
    if (event.key === "Tab") {
        setSeasonMenuOpen(selector, false);
        return;
    }

    let nextIndex: number | null = null;
    if (event.key === "ArrowDown") {
        nextIndex = (currentIndex + 1) % options.length;
    } else if (event.key === "ArrowUp") {
        nextIndex = (currentIndex - 1 + options.length) % options.length;
    } else if (event.key === "Home") {
        nextIndex = 0;
    } else if (event.key === "End") {
        nextIndex = options.length - 1;
    }
    if (nextIndex !== null) {
        event.preventDefault();
        options[nextIndex]?.focus();
    }
}

function closeSeasonMenus(except?: HTMLElement): void {
    document.querySelectorAll<HTMLElement>(selectorQuery).forEach(selector => {
        if (selector !== except) {
            setSeasonMenuOpen(selector, false);
        }
    });
}

function setSeasonMenuOpen(
    selector: HTMLElement,
    open: boolean,
    focusTarget: "selected" | "last" | null = null
): void {
    const trigger = selector.querySelector<HTMLButtonElement>(triggerQuery);
    const menu = selector.querySelector<HTMLElement>("[data-season-menu]");
    if (!trigger || !menu) {
        return;
    }
    trigger.setAttribute("aria-expanded", String(open));
    menu.classList.toggle("hidden", !open);
    selector.classList.toggle("season-selector--open", open);
    if (!open || !focusTarget) {
        return;
    }
    const options = Array.from(menu.querySelectorAll<HTMLButtonElement>(optionQuery));
    const target = focusTarget === "last"
        ? options[options.length - 1]
        : options.find(item => item.getAttribute("aria-selected") === "true") || options[0];
    target?.focus();
}
