export interface BackdropLayout {
    imageWidth: number;
    sidebarWidth: number;
}

const CROPPED_BACKDROP_ASPECT_RATIO = 352 / 225;

export function calculateBackdropLayout(
    viewportWidth: number,
    viewportHeight: number,
    requestedSidebarWidth: number
): BackdropLayout {
    const width = Math.max(0, viewportWidth);
    const height = Math.max(0, viewportHeight);
    const sidebarWidth = Math.min(Math.max(0, requestedSidebarWidth), width);
    const availableWidth = Math.max(1, width - sidebarWidth);
    const availableHeight = Math.max(1, height);

    return {
        imageWidth: Math.min(availableWidth, availableHeight * CROPPED_BACKDROP_ASPECT_RATIO),
        sidebarWidth
    };
}
