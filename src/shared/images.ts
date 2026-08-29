export interface JellyfinImageUrlOptions {
    serverUrl: string;
    accessToken: string;
    itemId: string;
    imageType: string;
    imageIndex?: number;
    imageTag?: string;
    maxWidth?: number;
}

export function buildJellyfinImageUrl(options: JellyfinImageUrlOptions): string {
    if (!options.serverUrl || !options.itemId || !options.imageType) {
        return "";
    }

    const baseUrl = options.serverUrl.trim().replace(/\/+$/, "");
    const imageIndex = options.imageIndex ?? 0;
    const endpoint = `${baseUrl}/Items/${encodeURIComponent(options.itemId)}`
        + `/Images/${encodeURIComponent(options.imageType)}/${imageIndex}`;
    const query: string[] = [
        `maxWidth=${encodeURIComponent(String(options.maxWidth || 1920))}`,
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
