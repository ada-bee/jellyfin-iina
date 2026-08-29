import type { PlaybackPreferences } from "../../playback/ports";

export class IinaPlaybackPreferences implements PlaybackPreferences {
    constructor(
        private readonly autoplayKey: string,
        private readonly skipSegmentsKey: string
    ) {}

    autoplayNextEpisodeEnabled(): boolean {
        return preferenceEnabledByDefault(this.autoplayKey);
    }

    skipSegmentsEnabled(): boolean {
        return preferenceEnabledByDefault(this.skipSegmentsKey);
    }
}

function preferenceEnabledByDefault(key: string): boolean {
    const value = iina.preferences.get(key);
    return value === undefined || value === null ? true : Boolean(value);
}
