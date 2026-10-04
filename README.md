# Jellyfin IINA Plugin

Plugin for accessing Movies and TV series from your Jellyfin server in IINA. Displays a simplified view of your library that lets you browse and play items right from IINA. **Not affiliated with the official Jellyfin Project.**

Version 3 requires Jellyfin 12 and IINA 1.5 or newer. Use the existing 2.x release with older Jellyfin servers.

If you like this plugin you might also be interested in [YouTube IINA Plugin](https://github.com/ada-bee/youtube-iina).

## Installation

1. In IINA, open Settings > Plugins.
2. Select Install from GitHub.
3. Enter `ada-bee/jellyfin-iina`
4. Restart IINA if it does not appear immediately.

The repository root contains the complete plugin, so IINA can install a GitHub source
archive directly when no release asset is available.

## Usage

- Open the Jellyfin sidebar with Shift+J.
- The plugin reopens its browser on a generated idle player surface.
- Warning: **https is required** since v2.0.0

## Features

- Jellyfin-negotiated direct play. Server remuxing and transcoding are planned for 3.1.0; 3.0 shows an error when direct play is unavailable.
- Library browsing. Home screen shows Next Up and Recently Added. You can search for anything else.
- Optional backdrop slides and previews in the idle browser, plus the current item while Jellyfin playback is paused.
- Playback progress reporting back to the Jellyfin server.
- Resume playback from last position.
- Authenticated external subtitles through IINA's native track controls. Standalone VobSub `.idx`/`.sub` pairs are not supported.
- Auto-play next episode (can be disabled). Next episode is added to the mpv playlist for native feel and media key support.
- Intro-skipper integration (can be disabled). Clickable Skip button shows up during Intro/Credits similarly to the web interface.

Saved credentials are migrated to macOS Keychain. New playback URLs omit access tokens;
older IINA history entries are left intact. IINA itself can include authenticated command
arguments in debug logs, so those logs may still contain credentials.

## Development

Use the exact Bun version pinned in `package.json` (currently 1.4.2). Install dependencies
with `bun install --frozen-lockfile`, then use:

- `bun run verify` to run tests, type checks, and runtime-tree validation.
- `bun run build` to refresh the committed bundles in `dist/` and `ui/dist/`.
- `bun run preview` to open the sidebar browser preview.
- `bun run package` to build and verify the `.iinaplgz` release archive.

Link the repository root with `iina-plugin link .` to load it as a development plugin.
Commit bundle changes alongside their TypeScript sources; CI fresh-builds them and rejects
any difference.

## Releasing

Complete [manual acceptance](docs/manual-acceptance.md), update `Info.json` (`version` and
an increasing `ghVersion`), and commit fresh bundles. For the first release with this
workflow, replace the old release workflow on `main` while preserving its advertised
plugin version. Create a matching `vX.Y.Z` tag and run
`gh workflow run release.yml --ref vX.Y.Z -f tag=vX.Y.Z`.
**Prepare release** verifies metadata, runs CI, and creates a draft
containing the checked `.iinaplgz` archive. Review and publish the draft, then update
`main` to the same release commit. IINA checks `main/Info.json` before downloading the
latest release, so advertising a new `ghVersion` before its archive is published can
reinstall the previous version.

## Disclaimer

This was made primarily for me and was largely vibe coded. While this is my daily driver and I intend to maintain, it should be considered mostly feature complete as it already does everything I need.

## Attribution

Includes logos and icons licensed under [CC-BY-SA-4.0](https://creativecommons.org/licenses/by-sa/4.0/) by the [Jellyfin Project](https://github.com/jellyfin/jellyfin-ux).
