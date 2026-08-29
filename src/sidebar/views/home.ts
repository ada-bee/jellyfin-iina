import type { JellyfinBaseItem } from "../../jellyfin/types";
import type { ListCardOptions } from "../viewModels";
import { setBackdropSlideshow } from "../backdropContext";
import { ui } from "../dom";
import { buildListCardElement, getNextUpImageOptions } from "./cards";
import { replaceContent } from "./content";
import { buildDisclosureChevron } from "./elements";
import { buildFeedbackState } from "./feedback";

type HomeSectionId = "continue-watching" | "new" | "movies" | "series";

interface HomeSection {
    id: HomeSectionId;
    title: string;
    items: JellyfinBaseItem[];
    options: ListCardOptions;
    libraryType?: string;
}

let homeRailResizeHandlerInstalled = false;

export function renderHomeSections(
    continueWatchingItems: JellyfinBaseItem[],
    newestEpisodes: JellyfinBaseItem[],
    recentMovies: JellyfinBaseItem[],
    recentSeries: JellyfinBaseItem[]
): void {
    const home = document.createElement("div");
    home.className = "home-sections";
    const sections = buildHomeSections(
        continueWatchingItems,
        newestEpisodes,
        recentMovies,
        recentSeries
    );
    sections.forEach(section => home.appendChild(buildHomeSection(section)));

    replaceContent(home);
    setBackdropSlideshow(sections.flatMap(section => section.items));
    installHomeRailResizeHandler();
    requestAnimationFrame(updateAllHomeRailShadows);
}

function buildHomeSections(
    continueWatchingItems: JellyfinBaseItem[],
    newestEpisodes: JellyfinBaseItem[],
    recentMovies: JellyfinBaseItem[],
    recentSeries: JellyfinBaseItem[]
): HomeSection[] {
    return [
        {
            id: "continue-watching",
            title: "Continue watching",
            items: continueWatchingItems,
            options: {
                homeThumbnail: true,
                directPlay: true,
                showSeriesName: true,
                showEpisodeNumber: true,
                hideRuntime: true,
                ...getNextUpImageOptions()
            }
        },
        {
            id: "new",
            title: "New episodes",
            items: newestEpisodes,
            options: {
                homeThumbnail: true,
                directPlay: true,
                showSeriesName: true,
                showEpisodeNumber: true,
                hideRuntime: true,
                useEpisodeThumbnail: true
            }
        },
        {
            id: "movies",
            title: "Movies",
            items: recentMovies,
            options: { homePoster: true, usePosterImage: true, showSeriesName: false },
            libraryType: "movies"
        },
        {
            id: "series",
            title: "Series",
            items: recentSeries,
            options: { homePoster: true, usePosterImage: true, showSeriesName: false },
            libraryType: "tvshows"
        }
    ];
}

function buildHomeSection(sectionModel: HomeSection): HTMLElement {
    const { id, title, items, options, libraryType } = sectionModel;
    const section = document.createElement("section");
    section.className = "home-shelf";
    section.appendChild(buildHomeSectionHeading(title, libraryType));

    if (items.length > 0) {
        section.appendChild(buildHomeMediaRail(title, items, options));
    } else {
        const empty = buildFeedbackState("Nothing Here Yet", getHomeEmptyDetail(id));
        empty.classList.add("home-shelf-empty");
        section.appendChild(empty);
    }
    return section;
}

function buildHomeSectionHeading(title: string, libraryType?: string): HTMLElement {
    const heading = document.createElement("h3");
    if (!libraryType) {
        heading.textContent = title;
        return heading;
    }

    const link = document.createElement("button");
    link.className = "home-section-link";
    link.type = "button";
    link.dataset.homeLibrary = libraryType;
    link.dataset.homeLibraryName = title;
    link.setAttribute("aria-label", `Open ${title}`);
    const label = document.createElement("span");
    label.textContent = title;
    link.append(label, buildDisclosureChevron());
    heading.appendChild(link);
    return heading;
}

function buildHomeMediaRail(
    title: string,
    items: JellyfinBaseItem[],
    options: ListCardOptions
): HTMLElement {
    const rail = document.createElement("div");
    rail.className = "home-media-rail";
    rail.classList.toggle("home-media-rail--thumbnail", Boolean(options.homeThumbnail));
    const row = document.createElement("div");
    row.className = "home-media-row";
    row.setAttribute("aria-label", title);
    items.forEach(item => row.appendChild(buildListCardElement(item, options)));
    installHorizontalDrag(row);
    row.addEventListener("scroll", () => updateHomeRailShadow(row), { passive: true });
    rail.append(
        buildHomeRailButton(row, title, -1),
        buildHomeRailButton(row, title, 1),
        row
    );
    return rail;
}

function buildHomeRailButton(row: HTMLElement, sectionTitle: string, direction: -1 | 1): HTMLButtonElement {
    const isPrevious = direction === -1;
    const button = document.createElement("button");
    button.className = `home-scroll-button home-scroll-button--${isPrevious ? "previous" : "next"}`;
    button.type = "button";
    button.setAttribute("aria-label", `${isPrevious ? "Previous" : "Next"} ${sectionTitle}`);
    button.innerHTML = `<svg width="17" height="17" viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="m${isPrevious ? "11.5 3.5-5 5.5 5 5.5" : "6.5 3.5 5 5.5-5 5.5"}" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    button.addEventListener("click", () => {
        row.scrollBy({
            left: direction * row.clientWidth * .8,
            behavior: "smooth"
        });
    });
    return button;
}

function installHorizontalDrag(row: HTMLElement): void {
    let pointerId: number | null = null;
    let startX = 0;
    let startScrollLeft = 0;
    let dragging = false;
    let suppressClick = false;

    row.addEventListener("pointerdown", event => {
        if (
            event.pointerType !== "mouse" ||
            event.button !== 0 ||
            pointerId !== null ||
            row.scrollWidth <= row.clientWidth + 1
        ) {
            return;
        }
        pointerId = event.pointerId;
        startX = event.clientX;
        startScrollLeft = row.scrollLeft;
    });
    row.addEventListener("pointermove", event => {
        if (pointerId !== event.pointerId) {
            return;
        }
        const distance = event.clientX - startX;
        if (!dragging && Math.abs(distance) < 5) {
            return;
        }
        if (!dragging) {
            dragging = true;
            row.classList.add("home-media-row--dragging");
            row.setPointerCapture(event.pointerId);
        }
        event.preventDefault();
        row.scrollLeft = startScrollLeft - distance;
    });
    row.addEventListener("pointerleave", () => {
        if (!dragging) {
            pointerId = null;
        }
    });
    const finishDrag = (event: PointerEvent) => {
        if (pointerId !== event.pointerId) {
            return;
        }
        pointerId = null;
        if (!dragging) {
            return;
        }
        dragging = false;
        suppressClick = true;
        row.classList.remove("home-media-row--dragging");
        if (row.hasPointerCapture(event.pointerId)) {
            row.releasePointerCapture(event.pointerId);
        }
        window.setTimeout(() => {
            suppressClick = false;
        }, 0);
    };
    row.addEventListener("pointerup", finishDrag);
    row.addEventListener("pointercancel", finishDrag);
    row.addEventListener("click", event => {
        if (suppressClick) {
            event.preventDefault();
            event.stopImmediatePropagation();
        }
    }, true);
    row.addEventListener("dragstart", event => event.preventDefault());
}

function installHomeRailResizeHandler(): void {
    if (homeRailResizeHandlerInstalled) {
        return;
    }
    homeRailResizeHandlerInstalled = true;
    window.addEventListener("resize", updateAllHomeRailShadows, { passive: true });
}

function updateAllHomeRailShadows(): void {
    ui.content.querySelectorAll<HTMLElement>(".home-media-row").forEach(updateHomeRailShadow);
}

function updateHomeRailShadow(row: HTMLElement): void {
    const rail = row.closest<HTMLElement>(".home-media-rail");
    if (!rail) {
        return;
    }
    const maximumScroll = Math.max(row.scrollWidth - row.clientWidth, 0);
    const canScrollLeft = row.scrollLeft > 1;
    const canScrollRight = row.scrollLeft < maximumScroll - 1;
    rail.classList.toggle("can-scroll-left", canScrollLeft);
    rail.classList.toggle("can-scroll-right", canScrollRight);
    const previous = rail.querySelector<HTMLButtonElement>(".home-scroll-button--previous");
    const next = rail.querySelector<HTMLButtonElement>(".home-scroll-button--next");
    if (previous) {
        previous.disabled = !canScrollLeft;
    }
    if (next) {
        next.disabled = !canScrollRight;
    }
}

function getHomeEmptyDetail(section: HomeSectionId): string {
    if (section === "continue-watching") {
        return "Partially watched movies and your next episodes will appear here.";
    }
    return "Newly added titles will appear here.";
}
