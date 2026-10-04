import { buildMediaBrowserAuthorizationHeader } from "../../jellyfin/auth";
import type { PlaybackContext } from "../../jellyfin/types";
import { isSameServerUrl } from "../../jellyfin/url";
import { CLIENT_NAME, CLIENT_VERSION, DEVICE_NAME } from "./constants";

export function mediaRequestHeaders(
    playback: PlaybackContext,
    url: string
): Record<string, string> {
    if (!isSameServerUrl(playback.serverUrl, url)) {
        return {};
    }
    return {
        Authorization: buildMediaBrowserAuthorizationHeader({
            clientName: CLIENT_NAME,
            deviceName: DEVICE_NAME,
            deviceId: playback.deviceId,
            version: CLIENT_VERSION,
            token: playback.accessToken
        })
    };
}

export function escapeMpvOption(value: string): string {
    // loadfile options use byte lengths, while JavaScript strings count UTF-16 units.
    let bytes = 0;
    for (const character of value) {
        const code = character.codePointAt(0) || 0;
        bytes += utf8Length(code);
    }
    return `%${bytes}%${value}`;
}

function utf8Length(code: number): number {
    if (code <= 0x7f) return 1;
    if (code <= 0x7ff) return 2;
    return code <= 0xffff ? 3 : 4;
}

export function escapeMpvListItem(value: string): string {
    return value.replace(/,/g, "\\,");
}
