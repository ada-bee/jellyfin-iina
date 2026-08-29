# Jellyfin 12 manual acceptance

Run this matrix against IINA 1.4.4 and the current Jellyfin 12 release candidate or
stable release. Record the exact versions and any failure notes with the test run.

## Fixtures

- An HTTPS Jellyfin server, preferably exposed through a non-root Base URL.
- A movie with resume progress and at least two media versions.
- Two sequential episodes with intro or credits segments.
- Media with multiple audio tracks plus internal and external text subtitles.
- A user whose playback policy can be changed to require remuxing or transcoding.

## Matrix

- [ ] Fresh login succeeds and the session survives an IINA restart.
- [ ] A network outage, server error, or `403` leaves the saved session intact.
- [ ] A revoked token (`401`) returns to login with the server URL and username preserved.
- [ ] All browsing, image, playback, subtitle, segment, and reporting requests work through the Base URL prefix.
- [ ] Direct play starts the server-preferred media version and reports `DirectPlay`.
- [ ] A server-mandated remux reports `DirectStream`; video encoding reports `Transcode`.
- [ ] No usable media source leaves the sidebar open with a clear error and does not request `/Download`.
- [ ] Resume starts near the saved position and subsequent progress is reported.
- [ ] Replacing playback stops the old session once and starts the new session once.
- [ ] Natural end, paused-at-EOF, window close, and app termination each report one final position.
- [ ] External subtitles load into IINA; the negotiated default is selected and alternatives remain available.
- [ ] Native audio and subtitle changes are reflected in Jellyfin session reporting.
- [ ] Autoplay queues the next episode, stops the finished session, and starts a new play session.
- [ ] Intro and credits controls appear at the expected times and seek to the segment end.
- [ ] `bun run ci` creates a verified archive that installs and opens successfully in IINA.
