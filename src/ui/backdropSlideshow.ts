export function resolvePlaylistIndex(
    currentIndex: number,
    playlistLength: number,
    advance: boolean
): number {
    if (playlistLength <= 0 || currentIndex < 0) {
        return 0;
    }
    return advance ? (currentIndex + 1) % playlistLength : currentIndex;
}
