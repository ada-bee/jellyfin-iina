import type { JellyfinBaseItem } from "../jellyfin/types";

const TICKS_PER_MINUTE = 600_000_000;

function episode(
    id: string,
    name: string,
    seriesName: string,
    seasonNumber: number,
    episodeNumber: number,
    runtimeMinutes: number,
    progressPercent = 0
): JellyfinBaseItem {
    return {
        Id: id,
        Name: name,
        Type: "Episode",
        SeriesId: `series-${seriesName.toLowerCase().replace(/ /g, "-")}`,
        SeasonId: `season-${seasonNumber}`,
        SeriesName: seriesName,
        ParentIndexNumber: seasonNumber,
        IndexNumber: episodeNumber,
        RunTimeTicks: runtimeMinutes * TICKS_PER_MINUTE,
        UserData: {
            PlaybackPositionTicks: Math.round(runtimeMinutes * TICKS_PER_MINUTE * progressPercent / 100),
            Played: progressPercent === 100
        }
    };
}

function movie(
    id: string,
    name: string,
    year: number,
    runtimeMinutes: number,
    progressPercent = 0
): JellyfinBaseItem {
    return {
        Id: id,
        Name: name,
        Type: "Movie",
        ProductionYear: year,
        RunTimeTicks: runtimeMinutes * TICKS_PER_MINUTE,
        UserData: {
            PlaybackPositionTicks: Math.round(runtimeMinutes * TICKS_PER_MINUTE * progressPercent / 100),
            Played: progressPercent === 100
        }
    };
}

function series(id: string, name: string, year: number, watched: number, total: number): JellyfinBaseItem {
    return {
        Id: id,
        Name: name,
        Type: "Series",
        ProductionYear: year,
        RecursiveItemCount: total,
        UserData: {
            UnplayedItemCount: total - watched
        }
    };
}

function season(id: string, name: string, indexNumber: number): JellyfinBaseItem {
    return {
        Id: id,
        Name: name,
        Type: "Season",
        IndexNumber: indexNumber
    };
}

export const upNextItems = [
    episode("the-plan", "The Plan", "North Station", 1, 5, 48, 63),
    episode("after-the-storm", "After the Storm", "Still Water", 2, 3, 54),
    episode("the-long-way-home", "The Long Way Home", "Orbital", 1, 8, 42, 100),
    episode("the-crossing", "The Crossing", "Still Water", 2, 4, 49),
    episode("signal-lost", "Signal Lost", "North Station", 1, 6, 47, 18),
    episode("apogee", "Apogee", "Orbital", 2, 1, 45),
    episode("undertow", "Undertow", "Still Water", 2, 5, 52),
    episode("last-service", "Last Service", "North Station", 1, 7, 50)
];

export const recentMovies = [
    movie("signal-fire", "Signal Fire", 2025, 112),
    movie("quiet-city", "The Quiet City", 2024, 98, 24),
    movie("night-train", "Night Train to Brno", 2026, 126),
    movie("glass-harbor", "Glass Harbor", 2025, 108),
    movie("winter-orbit", "Winter Orbit", 2024, 117),
    movie("second-sun", "The Second Sun", 2026, 103),
    movie("low-tide", "Low Tide", 2025, 94),
    movie("frequency", "Frequency", 2024, 101)
];

export const previewMovie: JellyfinBaseItem = {
    ...recentMovies[0],
    Overview: "After a mysterious transmission reaches an isolated mountain town, a radio astronomer must decide whether its warning is meant for Earth—or came from it.",
    Taglines: ["Some signals are better left unanswered."],
    OfficialRating: "PG-13"
};

export const recentEpisodes = [
    episode("open-water", "Open Water", "Still Water", 2, 2, 51),
    episode("arrival", "Arrival", "North Station", 1, 4, 46),
    episode("relay", "Relay", "Orbital", 1, 7, 44),
    episode("the-crossing-new", "The Crossing", "Still Water", 2, 4, 49),
    episode("signal-lost-new", "Signal Lost", "North Station", 1, 6, 47),
    episode("apogee-new", "Apogee", "Orbital", 2, 1, 45),
    episode("undertow-new", "Undertow", "Still Water", 2, 5, 52),
    episode("last-service-new", "Last Service", "North Station", 1, 7, 50)
];

export const recentSeries = [
    series("series-still-water", "Still Water", 2025, 7, 10),
    series("series-north-station", "North Station", 2025, 4, 10),
    series("series-orbital", "Orbital", 2024, 7, 8),
    series("series-quiet-city", "The Quiet City", 2024, 3, 8),
    series("series-night-train", "Night Train", 2026, 1, 6),
    series("series-glass-harbor", "Glass Harbor", 2025, 3, 9),
    series("series-second-sun", "The Second Sun", 2026, 2, 8),
    series("series-low-tide", "Low Tide", 2025, 5, 7)
];

export const searchResults = [
    series("series-north-station", "North Station", 2025, 4, 10),
    episode("the-plan", "The Plan", "North Station", 1, 5, 48, 63),
    movie("distant-signal", "A Distant Signal", 2019, 104, 100),
    movie("signal-fire", "Signal Fire", 2025, 112),
    series("series-orbital", "Orbital", 2024, 7, 8),
    episode("relay", "Relay", "Orbital", 1, 7, 44)
];

export const seasons = [
    season("season-1", "Season 1", 1),
    season("season-2", "Season 2", 2),
    season("season-3", "Season 3: The Very Long Winter Timetable", 3),
    season("season-specials", "Specials", 0)
];

export const previewSeries: JellyfinBaseItem = {
    ...recentSeries[1],
    Overview: "A night-shift dispatcher discovers that every train passing through North Station is carrying someone who should not exist.",
    Taglines: ["Every arrival changes the timetable."],
    OfficialRating: "TV-14",
    Status: "Continuing"
};

export const seasonEpisodes = [
    {
        ...episode("first-light", "First Light", "North Station", 1, 1, 47, 100),
        Overview: "Mara follows an impossible signal into the station's sealed lower platforms."
    },
    {
        ...episode("interchange", "Interchange", "North Station", 1, 2, 45, 100),
        Overview: "A missed connection brings a stranger with a warning from another timetable."
    },
    {
        ...episode("dead-line", "Dead Line", "North Station", 1, 3, 52, 81),
        Overview: "The night crew races to stop a train that no longer appears on their maps."
    },
    {
        ...episode("arrival", "Arrival", "North Station", 1, 4, 46),
        Overview: "An unexpected passenger forces Mara to question what she knows about the station."
    },
    {
        ...episode("the-plan", "The Plan", "North Station", 1, 5, 48),
        Overview: "With time running short, the crew prepares one last attempt to close the line."
    }
];
