export const PREVIEW_NAMES = [
    "home",
    "search",
    "movie",
    "series",
    "login",
    "loading",
    "empty",
    "error"
] as const;

export type PreviewName = typeof PREVIEW_NAMES[number];

export function isPreviewName(value: string | null): value is PreviewName {
    return PREVIEW_NAMES.some(name => name === value);
}

export function getRequestedPreview(search: string): PreviewName {
    const requested = new URLSearchParams(search).get("state");
    return isPreviewName(requested) ? requested : "home";
}

export function createPreviewUrl(currentUrl: string, name: PreviewName): URL {
    const url = new URL(currentUrl);
    url.searchParams.set("state", name);
    return url;
}
