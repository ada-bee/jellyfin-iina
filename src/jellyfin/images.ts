import { normalizeServerUrl } from "./url";

export interface JellyfinImageUrlOptions {
    serverUrl: string;
    accessToken: string;
    itemId: string;
    imageType?: string;
    imageIndex?: number;
    imageTag?: string;
    maxWidth?: number;
}

export function buildJellyfinImageUrl(options: JellyfinImageUrlOptions): string {
    if (!options.serverUrl || !options.itemId) {
        return "";
    }

    const baseUrl = normalizeServerUrl(options.serverUrl);
    const imageType = options.imageType || "Primary";
    const imageIndex = options.imageIndex === undefined ? "" : `/${options.imageIndex}`;
    const endpoint = `${baseUrl}/Items/${encodeURIComponent(options.itemId)}`
        + `/Images/${encodeURIComponent(imageType)}${imageIndex}`;
    const query = [
        `maxWidth=${encodeURIComponent(String(options.maxWidth || 120))}`,
        "quality=90"
    ];
    if (options.imageTag) {
        query.push(`tag=${encodeURIComponent(options.imageTag)}`);
    }
    if (options.accessToken) {
        query.push(`api_key=${encodeURIComponent(options.accessToken)}`);
    }
    return `${endpoint}?${query.join("&")}`;
}
