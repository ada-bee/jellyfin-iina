# Jellyfin IINA Plugin

Plugin for accessing Movies and TV series from your Jellyfin server in IINA. Displays a simplified view of your library that lets you browse and play items right from IINA. **Not affiliated with the official Jellyfin Project.**

Version 3 requires Jellyfin 12 and IINA 1.5 or newer. Use the existing 2.x release with older Jellyfin servers.

If you like this plugin you might also be interested in [YouTube IINA Plugin](https://github.com/ada-bee/youtube-iina).

## Installation

1. In IINA, open Settings > Plugins.
2. Select Install from GitHub.
3. Enter `ada-bee/jellyfin-iina`
4. Restart IINA if it does not appear immediately.

## Usage

- Open the Jellyfin sidebar with Shift+J.
- Warning: **https is required** since v2.0.0

## Features

- Direct play from Jellyfin. Remuxing and transcoding are planned for 3.1.0.
- Library browsing. Home screen shows Continue Watching and Recently Added. You can search for anything else.
- Optional backdrop previews while browsing and when playback is paused.
- Playback progress reporting back to the Jellyfin server.
- Resume playback from last position.
- External subtitles through IINA's native subtitle controls. Standalone VobSub `.idx`/`.sub` pairs are not supported.
- Auto-play next episode (can be disabled). Next episode is added to the mpv playlist for native feel and media key support.
- Intro/credits skipping using Jellyfin media segments (can be disabled). Clickable Skip button shows up during Intro/Credits similarly to the web interface.

## Disclaimer

This was made primarily for me and was largely vibe coded. While this is my daily driver and I intend to maintain, it should be considered mostly feature complete as it already does everything I need.

## Attribution

Includes logos and icons licensed under [CC-BY-SA-4.0](https://creativecommons.org/licenses/by-sa/4.0/) by the [Jellyfin Project](https://github.com/jellyfin/jellyfin-ux).
