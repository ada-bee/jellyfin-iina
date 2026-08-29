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
        `Client="${options.clientName}"`,
        `Device="${options.deviceName}"`,
        `DeviceId="${options.deviceId}"`,
        `Version="${options.version}"`
    ];

    if (options.token) {
        parts.push(`Token="${options.token}"`);
    }

    return `MediaBrowser ${parts.join(", ")}`;
}
