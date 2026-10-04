# Jellyfin 12 manual acceptance

Run this matrix against stable IINA 1.5 and Jellyfin 12. Record the exact versions,
plugin commit, and any failure notes with the test run. Unchecked items are unverified.
Version 3.0 supports direct play; remuxing and transcoding are deferred to 3.1.0.

## Fixtures

- An HTTPS Jellyfin server, preferably exposed through a non-root Base URL.
- A movie with resume progress and at least two media versions.
- Two sequential episodes with intro or credits segments.
- Media with multiple audio tracks, internal subtitles, and external SRT, ASS, and VTT subtitles.
- Media with a remembered subtitle choice of Off and media with a default external subtitle.
- A user whose playback policy can be changed to forbid direct play.

## Matrix

- [ ] A fresh archive installation opens the sidebar, logs in, and survives an IINA restart.
- [ ] Upgrading from 2.x preserves the server and username, migrates saved credentials, and removes legacy plaintext tokens.
- [ ] A network outage, server error, or `403` leaves the saved session intact.
- [ ] A revoked token (`401`) returns to login with the server URL and username preserved.
- [ ] A late `401` from an old login does not invalidate a newer session.
- [ ] All browsing, image, playback, subtitle, segment, and reporting requests work through the Base URL prefix.
- [ ] Direct play starts the server-preferred media version and reports `DirectPlay`.
- [ ] A policy requiring remuxing or transcoding leaves the sidebar open with a clear direct-play limitation.
- [ ] No usable media source leaves the sidebar open with a clear error and does not request `/Download`.
- [ ] Resume starts near the saved position and subsequent progress is reported.
- [ ] Replacing playback stops the old session once and starts the new session once.
- [ ] Clicking Play on two items quickly starts the most recently selected item.
- [ ] Clearing search while a request is pending does not restore the old results.
- [ ] Natural end, paused-at-EOF, window close, and app termination each report one final position.
- [ ] Direct play loads external SRT, ASS, and VTT tracks; the negotiated default is selected and alternatives remain available.
- [ ] A remembered subtitle Off remains off even when a track is marked default or forced.
- [ ] Subtitle switching works after resume, autoplay, and returning to an earlier native playlist entry.
- [ ] Playback and external subtitle requests succeed with Jellyfin's legacy query-token authentication disabled.
- [ ] Opening an unrelated URL after Jellyfin playback does not send Jellyfin credentials to that URL.
- [ ] Native audio and subtitle changes are reflected in Jellyfin session reporting.
- [ ] Autoplay queues the next episode, stops the finished session, and starts a new play session.
- [ ] Returning to an earlier playlist entry restores progress reporting and its external subtitles.
- [ ] Deleting an automatically queued episode lets the next transition recover without a stale queue entry.
- [ ] An initial stream load failure permits a later Play attempt and leaves no stuck playback session.
- [ ] Intro and credits controls appear at the expected times and seek to the segment end.
- [ ] `bun run ci` creates a verified archive that installs and opens successfully in IINA.
- [ ] After publication, IINA offers the update from 2.x and installs the matching version and `ghVersion` advertised by `main`.
