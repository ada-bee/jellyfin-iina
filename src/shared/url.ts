export function isHttpsUrl(url: string): boolean {
    return url.trim().toLowerCase().startsWith("https://");
}

export function normalizeServerUrl(url: string): string {
    return url.trim().replace(/\/+$/, "");
}
