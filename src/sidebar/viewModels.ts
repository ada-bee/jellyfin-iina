import type {
    JellyfinBaseItem,
    JellyfinMediaSourceInfo,
    JellyfinMediaStream
} from "../jellyfin/types";

import { TICKS_PER_MINUTE } from "../shared/constants";
import { formatPaddedEpisodeNumber, formatRuntime } from "./viewFormatting";
import type { SearchFilter } from "./router";

export interface ListCardOptions {
    showSeriesName?: boolean;
    showEpisodeNumber?: boolean;
    useEpisodeThumbnail?: boolean;
    disableEpisodeThumbnailFallback?: boolean;
    useSeriesBackdropFallback?: boolean;
    showSeriesEpisodeCounts?: boolean;
    homePoster?: boolean;
    homeThumbnail?: boolean;
    libraryPoster?: boolean;
    usePosterImage?: boolean;
    hideRuntime?: boolean;
    directPlay?: boolean;
    episodeRow?: boolean;
}

export interface CardContext {
    id: string;
    name: string;
    type: string;
    resume: number;
    directPlay: boolean;
    context: {
        seriesId: string;
        seasonId: string;
        episodeIndex: number | null;
    };
}

export type EpisodeLoadState = "ready" | "loading" | "error";

export interface MediaCardViewModel {
    context: CardContext;
    artworkOnly: boolean;
    showPlayOverlay: boolean;
    played: boolean;
    remainingLabel: string;
    progressPercent: number | null;
    title: string;
    metadata: string;
    episodeNumber: string;
    episodeRuntime: string;
    accessibleName: string;
    overview: string;
}

export interface MediaDetailsViewModel {
    metadata: string;
    tagline: string;
    overview: string;
    mediaFileSources: MediaFileMetadataSource[];
}

export interface MediaFileMetadataSource {
    mediaSourceId: string;
    groups: MediaFileMetadataGroup[];
}

export interface MediaFileMetadataGroup {
    kind: MediaFileTrackKind;
    label: string;
    tracks: MediaFileMetadataTrack[];
}

export type MediaFileTrackKind = "video" | "audio" | "subtitle";

export interface MediaFileMetadataTrack {
    title: string;
    technical: string;
    mediaSourceId: string | null;
    streamIndex: number | null;
    selected: boolean;
    selectable: boolean;
}

export interface SearchResultsViewModel {
    visibleItems: JellyfinBaseItem[];
    sections: SearchResultSection[];
    emptyMessage: string;
}

export interface SearchResultSection {
    filter: Exclude<SearchFilter, "all">;
    label: string;
    items: JellyfinBaseItem[];
}

interface CardCopy {
    title: string;
    metadata: string;
}

export function buildMediaCardViewModel(
    item: JellyfinBaseItem,
    options: ListCardOptions = {}
): MediaCardViewModel {
    const titleAndMetadata = getCardCopy(item, options);
    const episodeNumber = options.episodeRow ? getEpisodeRowNumber(item) : "";
    const episodeRuntime = options.episodeRow ? formatRuntime(item.RunTimeTicks) : "";
    const remainingLabel = getRemainingLabel(item);
    const accessibleTitle = episodeNumber
        ? `${episodeNumber} ${titleAndMetadata.title}`
        : titleAndMetadata.title;
    const accessibleMetadata = options.episodeRow ? episodeRuntime : titleAndMetadata.metadata;
    const remainingText = remainingLabel ? `, ${remainingLabel}` : "";
    const artworkOnly = Boolean(options.homePoster || options.libraryPoster);

    return {
        context: buildCardContext(item, Boolean(options.directPlay)),
        artworkOnly,
        showPlayOverlay: !artworkOnly && !opensDetails(item, options),
        played: Boolean(item.UserData?.Played),
        remainingLabel,
        progressPercent: getProgressPercent(item),
        title: titleAndMetadata.title,
        metadata: titleAndMetadata.metadata,
        episodeNumber,
        episodeRuntime,
        accessibleName: `${accessibleTitle}${accessibleMetadata ? `, ${accessibleMetadata}` : ""}${remainingText}`,
        overview: String(item.Overview || "")
    };
}

export function buildMediaDetailsViewModel(
    item: JellyfinBaseItem,
    seasonCount: number = 0
): MediaDetailsViewModel {
    return {
        metadata: getMediaDetailMetadata(item, seasonCount),
        tagline: item.Taglines?.find(value => Boolean(value?.trim()))?.trim() || "",
        overview: String(item.Overview || ""),
        mediaFileSources: getMediaFileSources(item)
    };
}

export function buildSearchResultsViewModel(
    items: JellyfinBaseItem[],
    filter: SearchFilter
): SearchResultsViewModel {
    const sections = getSearchResultSections(items)
        .filter(section => filter === "all" || section.filter === filter)
        .map(section => ({
            ...section,
            items: filter === "all" ? section.items.slice(0, 6) : section.items
        }))
        .filter(section => section.items.length > 0);
    const visibleItems = sections.flatMap(section => section.items);

    return {
        visibleItems,
        sections,
        emptyMessage: filter === "all" ? "No Results" : `No ${getFilterLabel(filter)} Found`
    };
}

function getSearchResultSections(items: JellyfinBaseItem[]): SearchResultSection[] {
    return [
        buildSearchResultSection(items, "movie", "Movies", "Movie"),
        buildSearchResultSection(items, "series", "Series", "Series"),
        buildSearchResultSection(items, "episode", "Episodes", "Episode")
    ];
}

function buildSearchResultSection(
    items: JellyfinBaseItem[],
    filter: SearchResultSection["filter"],
    label: string,
    itemType: string
): SearchResultSection {
    return { filter, label, items: items.filter(item => item.Type === itemType) };
}

export function buildCardContext(item: JellyfinBaseItem, directPlay: boolean = false): CardContext {
    return {
        id: item.Id || "",
        name: String(item.Name || "Untitled"),
        type: item.Type || "",
        resume: item.UserData?.PlaybackPositionTicks || 0,
        directPlay,
        context: {
            seriesId: item.SeriesId || "",
            seasonId: item.SeasonId || item.ParentId || "",
            episodeIndex: item.IndexNumber ?? null
        }
    };
}

export function getSeriesPlayLabel(item: JellyfinBaseItem): string {
    const episodeNumber = formatPaddedEpisodeNumber(item.ParentIndexNumber, item.IndexNumber);
    return `${getPlayActionLabel(item)} ${episodeNumber}`;
}

export function getPlayActionLabel(item: JellyfinBaseItem): "Play" | "Resume" {
    return item.UserData?.PlaybackPositionTicks && !item.UserData.Played ? "Resume" : "Play";
}

export function getProgressPercent(item: JellyfinBaseItem): number | null {
    if (!hasProgress(item)) {
        return null;
    }
    const runtime = item.RunTimeTicks || 0;
    const position = item.UserData?.PlaybackPositionTicks || 0;
    const percent = runtime ? Math.min((position / runtime) * 100, 100) : 0;
    return percent >= 1 ? percent : null;
}

function opensDetails(item: JellyfinBaseItem, options: ListCardOptions): boolean {
    return !options.directPlay
        && (item.Type === "Movie" || item.Type === "Series" || item.Type === "Episode");
}

function getEpisodeRowNumber(item: JellyfinBaseItem): string {
    if (item.IndexNumber === undefined || item.IndexNumber === null) {
        return "";
    }
    return `E${String(item.IndexNumber).padStart(2, "0")}`;
}

function getMediaDetailMetadata(item: JellyfinBaseItem, seasonCount: number): string {
    const metadata: string[] = [];
    if (item.Type === "Episode") {
        if (item.SeriesName) {
            metadata.push(String(item.SeriesName));
        }
        metadata.push(formatPaddedEpisodeNumber(item.ParentIndexNumber, item.IndexNumber));
        const runtime = formatRuntime(item.RunTimeTicks);
        if (runtime) {
            metadata.push(runtime);
        }
    } else if (item.ProductionYear) {
        metadata.push(getYearLabel(item));
    }
    if (item.Type === "Movie") {
        const runtime = formatRuntime(item.RunTimeTicks);
        if (runtime) {
            metadata.push(runtime);
        }
    }
    if (seasonCount > 0) {
        metadata.push(`${seasonCount} ${seasonCount === 1 ? "season" : "seasons"}`);
    }
    if (item.OfficialRating) {
        metadata.push(item.OfficialRating);
    }
    return metadata.join(" · ");
}

function getMediaFileSources(item: JellyfinBaseItem): MediaFileMetadataSource[] {
    const sources = item.MediaSources || [];
    return sources
        .map((source, index) => ({ source, selected: index === 0 }))
        .sort((left, right) => compareMediaSources(left.source, right.source))
        .map(({ source, selected }) => ({
            mediaSourceId: source.Id || "",
            groups: getMediaFileGroups(source, selected, sources.length > 1)
        }));
}

function getMediaFileGroups(
    source: JellyfinMediaSourceInfo,
    selected: boolean,
    hasVersions: boolean
): MediaFileMetadataGroup[] {
    const streams = source.MediaStreams || [];
    const audioStreams = streams
        .filter(stream => stream.Type === "Audio")
        .sort(compareMediaStreams);
    const subtitleStreams = streams
        .filter(stream => stream.Type === "Subtitle")
        .sort(compareMediaStreams);
    const audioStreamIndex = getInitialAudioStreamIndex(audioStreams, source.DefaultAudioStreamIndex);
    const subtitleStreamIndex = getInitialSubtitleStreamIndex(
        subtitleStreams,
        source.DefaultSubtitleStreamIndex
    );
    const groups = [
        buildMediaFileGroup(
            "video",
            "Video",
            [formatVideoSource(source, selected, hasVersions)]
        ),
        buildMediaFileGroup(
            "audio",
            "Audio",
            audioStreams.map(stream =>
                formatAudioStream(stream, audioStreamIndex, audioStreams.length > 1)
            )
        ),
        buildMediaFileGroup(
            "subtitle",
            "Subtitles",
            subtitleStreams.map(stream => formatSubtitleStream(stream, subtitleStreamIndex))
        )
    ];
    return groups.filter(group => group.tracks.length > 0);
}

function buildMediaFileGroup(
    kind: MediaFileTrackKind,
    label: string,
    tracks: MediaFileMetadataTrack[]
): MediaFileMetadataGroup {
    return { kind, label, tracks };
}

function formatVideoSource(
    source: JellyfinMediaSourceInfo,
    selected: boolean,
    hasVersions: boolean
): MediaFileMetadataTrack {
    const stream = source.MediaStreams?.find(candidate => candidate.Type === "Video");
    return {
        title: getResolutionLabel(stream?.Width, stream?.Height)
            || source.Name?.trim()
            || "Video",
        technical: [
            getCodecLabel(stream?.Codec),
            getBitrateLabel(stream?.BitRate || source.Bitrate)
        ].filter(Boolean).join(" · "),
        mediaSourceId: source.Id || null,
        streamIndex: null,
        selected,
        selectable: hasVersions && Boolean(source.Id)
    };
}

function formatAudioStream(
    stream: JellyfinMediaStream,
    selectedIndex: number | null,
    hasAlternatives: boolean
): MediaFileMetadataTrack {
    return {
        title: getLanguageLabel(stream),
        technical: [getCodecLabel(stream.Codec), getChannelLabel(stream)]
            .filter(Boolean)
            .join(" "),
        mediaSourceId: null,
        streamIndex: stream.Index ?? null,
        selected: stream.Index === selectedIndex,
        selectable: hasAlternatives && stream.Index !== undefined
    };
}

function formatSubtitleStream(
    stream: JellyfinMediaStream,
    selectedIndex: number | null
): MediaFileMetadataTrack {
    return {
        title: getLanguageLabel(stream),
        technical: [
            stream.IsHearingImpaired ? "SDH" : "",
            stream.IsForced ? "Forced" : "",
            getCodecLabel(stream.Codec)
        ].filter(Boolean).join(" · "),
        mediaSourceId: null,
        streamIndex: stream.Index ?? null,
        selected: stream.Index === selectedIndex,
        selectable: stream.Index !== undefined
    };
}

function getInitialAudioStreamIndex(
    streams: JellyfinMediaStream[],
    defaultIndex?: number | null
): number | null {
    return defaultIndex
        ?? streams.find(stream => stream.IsDefault)?.Index
        ?? streams.find(stream => stream.Index !== undefined)?.Index
        ?? null;
}

function getInitialSubtitleStreamIndex(
    streams: JellyfinMediaStream[],
    defaultIndex?: number | null
): number | null {
    return defaultIndex ?? streams.find(stream => stream.IsDefault)?.Index ?? null;
}

function compareMediaSources(
    left: JellyfinMediaSourceInfo,
    right: JellyfinMediaSourceInfo
): number {
    const resolutionDifference = getMediaSourceResolution(left) - getMediaSourceResolution(right);
    return resolutionDifference || getMediaSourceBitrate(left) - getMediaSourceBitrate(right);
}

function getMediaSourceResolution(source: JellyfinMediaSourceInfo): number {
    const stream = source.MediaStreams?.find(candidate => candidate.Type === "Video");
    return getResolutionClass(stream?.Width, stream?.Height) ?? Number.MAX_SAFE_INTEGER;
}

function getMediaSourceBitrate(source: JellyfinMediaSourceInfo): number {
    const stream = source.MediaStreams?.find(candidate => candidate.Type === "Video");
    return stream?.BitRate || source.Bitrate || Number.MAX_SAFE_INTEGER;
}

function compareMediaStreams(left: JellyfinMediaStream, right: JellyfinMediaStream): number {
    return (left.Index ?? Number.MAX_SAFE_INTEGER) - (right.Index ?? Number.MAX_SAFE_INTEGER);
}

function getResolutionLabel(width?: number | null, height?: number | null): string {
    const resolutionClass = getResolutionClass(width, height);
    return resolutionClass ? `${resolutionClass}p` : "";
}

function getResolutionClass(width?: number | null, height?: number | null): number | null {
    if (!width && !height) {
        return null;
    }
    const resolution = RESOLUTION_CLASSES.find(candidate => (
        (width || 0) >= candidate.minimumWidth || (height || 0) >= candidate.minimumHeight
    ));
    return resolution?.label || 144;
}

function getCodecLabel(codec?: string | null): string {
    const normalized = codec?.trim().toLowerCase() || "";
    const labels: Record<string, string> = {
        aac: "AAC",
        ac3: "Dolby Digital",
        "ac-3": "Dolby Digital",
        av1: "AV1",
        av01: "AV1",
        avc: "AVC",
        avc1: "AVC",
        ass: "ASS",
        dca: "DTS",
        dts: "DTS",
        eac3: "Dolby Digital Plus",
        "e-ac-3": "Dolby Digital Plus",
        flac: "FLAC",
        h264: "AVC",
        h265: "HEVC",
        hdmv_pgs_subtitle: "PGS",
        hevc: "HEVC",
        hev1: "HEVC",
        hvc1: "HEVC",
        mpeg2: "MPEG-2",
        mpeg2video: "MPEG-2",
        mpeg4: "MPEG-4",
        mpeg4video: "MPEG-4",
        mp3: "MP3",
        opus: "Opus",
        pgs: "PGS",
        srt: "SRT",
        subrip: "SRT",
        truehd: "Dolby TrueHD",
        vc1: "VC-1",
        vp8: "VP8",
        vp9: "VP9",
        webvtt: "WebVTT"
    };
    return labels[normalized] || normalized.toUpperCase();
}

const RESOLUTION_CLASSES = [
    { label: 4320, minimumWidth: 7000, minimumHeight: 4000 },
    { label: 2160, minimumWidth: 3800, minimumHeight: 2000 },
    { label: 1440, minimumWidth: 2500, minimumHeight: 1300 },
    { label: 1080, minimumWidth: 1900, minimumHeight: 1000 },
    { label: 720, minimumWidth: 1200, minimumHeight: 700 },
    { label: 576, minimumWidth: 1000, minimumHeight: 540 },
    { label: 480, minimumWidth: 700, minimumHeight: 450 },
    { label: 360, minimumWidth: 600, minimumHeight: 340 },
    { label: 240, minimumWidth: 400, minimumHeight: 220 }
] as const;

function getBitrateLabel(bitrate?: number | null): string {
    if (!bitrate || bitrate <= 0) {
        return "";
    }
    const megabits = bitrate / 1_000_000;
    const rounded = megabits >= 10 ? Math.round(megabits) : Math.round(megabits * 10) / 10;
    return `${rounded} Mbps`;
}

function getChannelLabel(stream: JellyfinMediaStream): string {
    const layout = stream.ChannelLayout?.trim().toLowerCase() || "";
    if (layout === "mono") {
        return "Mono";
    }
    if (layout === "stereo") {
        return "Stereo";
    }
    if (layout) {
        return layout;
    }
    const channelLabels: Record<number, string> = {
        1: "Mono",
        2: "Stereo",
        6: "5.1",
        8: "7.1"
    };
    return stream.Channels ? channelLabels[stream.Channels] || `${stream.Channels} ch` : "";
}

function getLanguageLabel(stream: JellyfinMediaStream): string {
    const language = stream.Language?.trim() || "";
    if (!language) {
        return stream.Title?.trim() || "Unknown";
    }
    try {
        return LANGUAGE_DISPLAY_NAMES?.of(language) || language.toUpperCase();
    } catch {
        return language.toUpperCase();
    }
}

interface LanguageDisplayNames {
    of(language: string): string | undefined;
}

interface LanguageDisplayNamesConstructor {
    new(locales: string[], options: { type: "language" }): LanguageDisplayNames;
}

function createLanguageDisplayNames(): LanguageDisplayNames | null {
    const constructor = (Intl as unknown as {
        DisplayNames?: LanguageDisplayNamesConstructor;
    }).DisplayNames;
    return constructor ? new constructor(["en"], { type: "language" }) : null;
}

const LANGUAGE_DISPLAY_NAMES = createLanguageDisplayNames();

function getYearLabel(item: JellyfinBaseItem): string {
    const startYear = item.ProductionYear;
    if (!startYear || item.Type !== "Series") {
        return String(startYear || "");
    }
    const endYear = item.EndDate ? new Date(item.EndDate).getFullYear() : 0;
    if (endYear && endYear !== startYear) {
        return `${startYear}–${endYear}`;
    }
    return item.Status === "Continuing" ? `${startYear}–` : String(startYear);
}

function getCardCopy(item: JellyfinBaseItem, options: ListCardOptions): CardCopy {
    return item.Type === "Episode"
        ? getEpisodeCardCopy(item, options)
        : getMediaCardCopy(item, options);
}

function getEpisodeCardCopy(item: JellyfinBaseItem, options: ListCardOptions): CardCopy {
    const itemName = String(item.Name || "Untitled");
    if (options.homeThumbnail) {
        return getHomeEpisodeCardCopy(item, itemName, options.showEpisodeNumber === true);
    }

    const metadata: string[] = [];
    const seriesIsTitle = options.showSeriesName !== false && Boolean(item.SeriesName);
    if (options.showEpisodeNumber) {
        metadata.push(formatPaddedEpisodeNumber(item.ParentIndexNumber, item.IndexNumber));
    }
    if (seriesIsTitle) {
        metadata.push(itemName);
    }
    const runtime = formatRuntime(item.RunTimeTicks || undefined);
    if (!options.hideRuntime && (!hasProgress(item) || options.episodeRow) && runtime) {
        metadata.push(runtime);
    }
    return {
        title: seriesIsTitle ? String(item.SeriesName) : itemName,
        metadata: metadata.join(" · ")
    };
}

function getHomeEpisodeCardCopy(
    item: JellyfinBaseItem,
    itemName: string,
    showEpisodeNumber: boolean
): CardCopy {
    const metadata = item.SeriesName ? [String(item.SeriesName)] : [];
    if (showEpisodeNumber) {
        metadata.push(formatPaddedEpisodeNumber(item.ParentIndexNumber, item.IndexNumber));
    }
    return { title: itemName, metadata: metadata.join(" · ") };
}

function getMediaCardCopy(item: JellyfinBaseItem, options: ListCardOptions): CardCopy {
    const metadata: string[] = [];
    if (item.ProductionYear) {
        metadata.push(String(item.ProductionYear));
    }
    const runtime = formatRuntime(item.RunTimeTicks || undefined);
    if (!options.hideRuntime && runtime) {
        metadata.push(runtime);
    }
    const episodeCount = options.showSeriesEpisodeCounts ? getSeriesEpisodeCount(item) : "";
    if (episodeCount) {
        metadata.push(episodeCount);
    }
    return { title: String(item.Name || "Untitled"), metadata: metadata.join(" · ") };
}

function getSeriesEpisodeCount(item: JellyfinBaseItem): string {
    const total = item.RecursiveItemCount || item.ChildCount || 0;
    if (!total) {
        return "";
    }
    const userData = item.UserData as (typeof item.UserData & { PlayedItemCount?: number }) | undefined;
    const played = userData?.PlayedItemCount ?? Math.max(total - (userData?.UnplayedItemCount || 0), 0);
    return `${played} of ${total} watched`;
}

function hasProgress(item: JellyfinBaseItem): boolean {
    return Boolean(item.UserData?.PlaybackPositionTicks && item.RunTimeTicks && !item.UserData.Played);
}

function getRemainingLabel(item: JellyfinBaseItem): string {
    if (!hasProgress(item)) {
        return "";
    }
    const remainingTicks = Math.max((item.RunTimeTicks || 0) - (item.UserData?.PlaybackPositionTicks || 0), 0);
    const minutes = Math.max(Math.ceil(remainingTicks / TICKS_PER_MINUTE), 1);
    return `${minutes} min left`;
}

function getFilterLabel(filter: SearchFilter): string {
    if (filter === "movie") {
        return "Movies";
    }
    if (filter === "series") {
        return "Series";
    }
    return "Episodes";
}
