import { CLIENT_NAME, DEBUG_LOGS, DEVICE_NAME, TICKS_PER_SECOND } from "../../shared/constants";

export { CLIENT_VERSION } from "../../jellyfin/version";
export { CLIENT_NAME, DEBUG_LOGS, DEVICE_NAME, TICKS_PER_SECOND };

export const SHOW_SIDEBAR_DELAY_MS = 300;
const JELLYFIN_SPLASH_URLS = [
    "~/Library/Application Support/com.colliderli.iina/plugins/xyz.brbc.jellyfin.iinaplugin/assets/Jellyfin.png",
    "~/Library/Application Support/com.colliderli.iina/plugins/xyz.brbc.jellyfin.iinaplugin-dev/assets/Jellyfin.png"
];

export function resolveJellyfinSplashUrl(fileExists: (path: string) => boolean): string {
    for (const path of JELLYFIN_SPLASH_URLS) {
        try {
            if (fileExists(path)) {
                return path;
            }
        } catch {
            // Fall back to the conventional installed path below.
        }
    }
    return JELLYFIN_SPLASH_URLS[0];
}

export const RESUME_SEEK_DELAY_MS = 1000;

export const PROGRESS_REPORT_INTERVAL_MS = 10000;
export const PLAYBACK_TICK_INTERVAL_MS = 1000;
export const EOF_WATCH_THRESHOLD_SECONDS = 0.5;

export const SKIP_SEGMENT_POLL_INTERVAL_MS = 500;
export const SKIP_SEGMENT_PREF_KEY = "skipSegmentsEnabled";
export const AUTOPLAY_NEXT_PREF_KEY = "autoplayNextEpisodeEnabled";
export const BACKDROP_PREVIEWS_PREF_KEY = "backdropPreviewsEnabled";
export const PREFER_EPISODE_IMAGES_IN_NEXT_UP_PREF_KEY = "preferEpisodeImagesInNextUp";
