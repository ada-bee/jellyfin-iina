import { DEBUG_LOGS, TICKS_PER_MINUTE } from "./constants";

export { isHttpsUrl } from "../shared/url";

export function log(...args: unknown[]): void {
    if (DEBUG_LOGS) {
        console.log("Jellyfin UI:", ...args);
    }
}

export function normalizeServerUrl(value: string): string {
    return value.trim().replace(/\/+$/, "");
}

export function getServerHost(serverUrl: string): string {
    try {
        return new URL(serverUrl).hostname;
    } catch (error) {
        return serverUrl;
    }
}

export function escapeHtml(text: unknown): string {
    if (text === null || text === undefined) {
        return "";
    }
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

export function formatRuntime(ticks?: number | null): string {
    if (!ticks) {
        return "";
    }
    const totalMinutes = Math.floor(ticks / TICKS_PER_MINUTE);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
}

export function formatEpisodeNumber(season?: number | null, episode?: number | null): string {
    return `S${season || 0}E${episode || 0}`;
}

export function formatPaddedEpisodeNumber(season?: number | null, episode?: number | null): string {
    const seasonNumber = String(season ?? 0).padStart(2, "0");
    const episodeNumber = String(episode ?? 0).padStart(2, "0");
    return `S${seasonNumber} E${episodeNumber}`;
}

export function normalizeQuery(value: string): string {
    return value.trim().toLowerCase();
}
