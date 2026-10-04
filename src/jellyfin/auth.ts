export interface MediaBrowserAuthHeaderOptions {
    clientName: string;
    deviceName: string;
    deviceId: string;
    version: string;
    token?: string;
}

export function buildMediaBrowserAuthorizationHeader(
    options: MediaBrowserAuthHeaderOptions
): string {
    const parts = [
        `Client="${escapeHeaderValue(options.clientName)}"`,
        `Device="${escapeHeaderValue(options.deviceName)}"`,
        `DeviceId="${escapeHeaderValue(options.deviceId)}"`,
        `Version="${escapeHeaderValue(options.version)}"`
    ];

    if (options.token) {
        parts.push(`Token="${escapeHeaderValue(options.token)}"`);
    }

    return `MediaBrowser ${parts.join(", ")}`;
}

function escapeHeaderValue(value: string): string {
    if (/[\r\n]/.test(value)) {
        throw new Error("Invalid Jellyfin authentication header.");
    }
    return encodeURIComponent(value);
}
