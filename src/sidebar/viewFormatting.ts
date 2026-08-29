import { TICKS_PER_MINUTE } from "../shared/constants";

export function formatRuntime(ticks?: number | null): string {
    if (!ticks) {
        return "";
    }
    const totalMinutes = Math.floor(ticks / TICKS_PER_MINUTE);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

export function formatPaddedEpisodeNumber(
    season?: number | null,
    episode?: number | null
): string {
    const seasonNumber = String(season ?? 0).padStart(2, "0");
    const episodeNumber = String(episode ?? 0).padStart(2, "0");
    return `S${seasonNumber} E${episodeNumber}`;
}
