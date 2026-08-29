import { normalizeServerUrl } from "./utils";

export interface ImageUrlOptions {
    serverUrl: string;
    accessToken: string;
    itemId: string;
    imageType?: string;
    maxWidth?: number;
}

export function buildJellyfinImageUrl(options: ImageUrlOptions): string {
    const serverUrl = normalizeServerUrl(options.serverUrl);
    if (!serverUrl || !options.itemId) {
        return "";
    }

    try {
        const url = new URL(serverUrl);
        const basePath = url.pathname.replace(/\/+$/, "");
        const imageType = options.imageType || "Primary";
        url.pathname = `${basePath}/Items/${encodeURIComponent(options.itemId)}` +
            `/Images/${encodeURIComponent(imageType)}`;
        url.searchParams.set("maxWidth", String(options.maxWidth || 120));
        url.searchParams.set("quality", "90");
        if (options.accessToken) {
            url.searchParams.set("api_key", options.accessToken);
        }
        return url.toString();
    } catch (error) {
        return "";
    }
}
