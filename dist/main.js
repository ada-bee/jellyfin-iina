(() => {
  // src/jellyfin/messages.ts
  var MESSAGE_NAMES = {
    AuthUpdated: "authUpdated",
    AuthCleared: "authCleared",
    PlayItem: "playItem",
    BackdropContext: "backdropContext",
    SidebarVisibilityChanged: "sidebarVisibilityChanged",
    RefreshSidebar: "refreshSidebar",
    SidebarPreferences: "sidebarPreferences",
    OverlayBackdrops: "overlayBackdrops",
    OverlaySkipButton: "overlaySkipButton",
    SkipSegment: "skipSegment"
  };

  // src/overlay/eligibility.ts
  var JELLYFIN_SIDEBAR_NAME = "plugin:xyz.brbc.jellyfin";
  function isJellyfinSidebarOpen(reportedSidebar, trackedOpen) {
    if (reportedSidebar === null || reportedSidebar === undefined) {
      return trackedOpen;
    }
    return reportedSidebar === JELLYFIN_SIDEBAR_NAME;
  }
  function isBackdropPlaybackPaused(playbackPaused, mediaPath) {
    return playbackPaused || mediaPath.endsWith("/Jellyfin.png");
  }
  function shouldShowBackdrop(state) {
    return state.playbackPaused && state.jellyfinSidebarOpen && state.previewsEnabled;
  }

  // src/shared/constants.ts
  var CLIENT_NAME = "IINA Jellyfin Plugin";
  var DEVICE_NAME = "IINA";
  var TICKS_PER_SECOND = 1e7;
  var TICKS_PER_MINUTE = TICKS_PER_SECOND * 60;
  var DEBUG_LOGS = false;
  // Info.json
  var Info_default = {
    name: "Jellyfin",
    identifier: "xyz.brbc.jellyfin",
    version: "3.0.0",
    ghRepo: "ada-bee/jellyfin-iina",
    ghVersion: 9,
    description: "Browse and play media from your Jellyfin server",
    author: {
      name: "ada-bee"
    },
    entry: "dist/main.js",
    globalEntry: "dist/global.js",
    sidebarTab: {
      name: "Jellyfin"
    },
    preferencesPage: "ui/preferences.html",
    preferenceDefaults: {
      skipSegmentsEnabled: true,
      autoplayNextEpisodeEnabled: true,
      backdropPreviewsEnabled: true,
      preferEpisodeImagesInNextUp: false
    },
    permissions: [
      "network-request",
      "show-osd",
      "show-alert",
      "sidebar",
      "file-system",
      "video-overlay"
    ],
    allowedDomains: ["*"]
  };

  // src/jellyfin/version.ts
  var CLIENT_VERSION = Info_default.version;
  // src/adapters/iina/constants.ts
  var SHOW_SIDEBAR_DELAY_MS = 300;
  var JELLYFIN_SPLASH_URLS = [
    "~/Library/Application Support/com.colliderli.iina/plugins/xyz.brbc.jellyfin.iinaplugin/assets/Jellyfin.png",
    "~/Library/Application Support/com.colliderli.iina/plugins/xyz.brbc.jellyfin.iinaplugin-dev/assets/Jellyfin.png"
  ];
  function resolveJellyfinSplashUrl(fileExists) {
    for (const path of JELLYFIN_SPLASH_URLS) {
      try {
        if (fileExists(path)) {
          return path;
        }
      } catch {}
    }
    return JELLYFIN_SPLASH_URLS[0];
  }
  var RESUME_SEEK_DELAY_MS = 1000;
  var PROGRESS_REPORT_INTERVAL_MS = 1e4;
  var PLAYBACK_TICK_INTERVAL_MS = 1000;
  var EOF_WATCH_THRESHOLD_SECONDS = 0.5;
  var SKIP_SEGMENT_POLL_INTERVAL_MS = 500;
  var SKIP_SEGMENT_PREF_KEY = "skipSegmentsEnabled";
  var AUTOPLAY_NEXT_PREF_KEY = "autoplayNextEpisodeEnabled";
  var BACKDROP_PREVIEWS_PREF_KEY = "backdropPreviewsEnabled";
  var PREFER_EPISODE_IMAGES_IN_NEXT_UP_PREF_KEY = "preferEpisodeImagesInNextUp";

  // src/adapters/iina/clock.ts
  class IinaClock {
    setInterval(callback, intervalMs) {
      return setInterval(callback, intervalMs);
    }
    clearInterval(handle) {
      clearInterval(handle);
    }
    setTimeout(callback, delayMs) {
      return setTimeout(callback, delayMs);
    }
    clearTimeout(handle) {
      clearTimeout(handle);
    }
  }

  // src/playback/subtitles.ts
  function orderExternalSubtitleTracks(tracks, selectedIndex) {
    return [...tracks].sort((left, right) => {
      const leftSelected = left.index === selectedIndex ? 1 : 0;
      const rightSelected = right.index === selectedIndex ? 1 : 0;
      return leftSelected - rightSelected;
    });
  }
  function buildSubtitleFlags(track) {
    const flags = [track.isDefault ? "select" : "auto"];
    if (track.isDefault) {
      flags.push("default");
    }
    if (track.isForced) {
      flags.push("forced");
    }
    if (track.isHearingImpaired) {
      flags.push("hearing-impaired");
    }
    return flags.join("+");
  }

  // src/playback/tracks.ts
  function resolveJellyfinTrackSelection(trackList, externalSubtitles, fallback) {
    if (!trackList || trackList.length === 0) {
      return fallback;
    }
    const audioTrack = findPrimarySelectedTrack(trackList, "audio");
    const subtitleTrack = findPrimarySelectedTrack(trackList, "sub");
    return {
      audioStreamIndex: getInternalStreamIndex(audioTrack),
      subtitleStreamIndex: getSubtitleStreamIndex(subtitleTrack, externalSubtitles)
    };
  }
  function findPrimarySelectedTrack(trackList, type) {
    return trackList.find((track) => track.type === type && track.selected === true && (track["main-selection"] === undefined || track["main-selection"] === 0)) || null;
  }
  function getInternalStreamIndex(track) {
    return track && typeof track["ff-index"] === "number" ? track["ff-index"] : null;
  }
  function getSubtitleStreamIndex(track, externalSubtitles) {
    if (!track) {
      return null;
    }
    if (!track.external) {
      return getInternalStreamIndex(track);
    }
    const filename = track["external-filename"] || "";
    return externalSubtitles.find((subtitle) => subtitle.url === filename)?.index ?? null;
  }

  // src/playback/title.ts
  function sanitizeMediaTitle(title) {
    return String(title).replace(/[\n\r,=]/g, " ");
  }

  // src/adapters/iina/player.ts
  class IinaPlayer {
    logger;
    constructor(logger) {
      this.logger = logger;
    }
    getPath() {
      return iina.mpv.getString("path") || "";
    }
    getPositionSeconds() {
      return iina.mpv.getNumber("time-pos") || 0;
    }
    getDurationSeconds() {
      return iina.mpv.getNumber("duration") || 0;
    }
    isPaused() {
      return iina.mpv.getFlag("pause");
    }
    isEofReached() {
      return iina.mpv.getFlag("eof-reached");
    }
    getPlaylist() {
      const playlist = iina.mpv.getNative("playlist");
      return Array.isArray(playlist) ? playlist : [];
    }
    getTrackSelection(playback) {
      const trackList = iina.mpv.getNative("track-list");
      return resolveJellyfinTrackSelection(Array.isArray(trackList) ? trackList : null, playback.externalSubtitles, {
        audioStreamIndex: playback.audioStreamIndex ?? null,
        subtitleStreamIndex: playback.subtitleStreamIndex ?? null
      });
    }
    loadReplacement(handoff, title) {
      iina.mpv.command("loadfile", buildLoadArguments(handoff.url, "replace", title));
    }
    loadNext(handoff, title) {
      iina.mpv.command("loadfile", buildLoadArguments(handoff.url, "insert-next", title));
    }
    removePlaylistEntry(index) {
      iina.mpv.command("playlist-remove", [String(index)]);
    }
    setWindowTitle(title) {
      if (!title) {
        return;
      }
      const safeTitle = sanitizeMediaTitle(title);
      const mpvWithSetString = iina.mpv;
      if (typeof mpvWithSetString.setString === "function") {
        mpvWithSetString.setString("force-media-title", safeTitle);
      } else {
        iina.mpv.set("force-media-title", safeTitle);
      }
      this.logger.debug("Jellyfin: Set window title to", safeTitle);
    }
    seek(seconds) {
      iina.mpv.set("time-pos", seconds);
    }
    loadExternalSubtitles(playback) {
      const orderedTracks = orderExternalSubtitleTracks(playback.externalSubtitles, playback.subtitleStreamIndex);
      for (const track of orderedTracks) {
        try {
          iina.mpv.command("sub-add", [
            track.url,
            buildSubtitleFlags(track),
            track.title,
            track.language
          ]);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          this.logger.error(`Jellyfin: Failed to load subtitle track ${track.index}: ${message}`);
        }
      }
    }
    open(url) {
      iina.core.open(url);
    }
  }
  function buildLoadArguments(url, mode, title) {
    if (!title) {
      return [url, mode];
    }
    return [url, mode, "-1", `force-media-title=${sanitizeMediaTitle(title)}`];
  }

  // src/adapters/iina/preferences.ts
  class IinaPlaybackPreferences {
    autoplayKey;
    skipSegmentsKey;
    constructor(autoplayKey, skipSegmentsKey) {
      this.autoplayKey = autoplayKey;
      this.skipSegmentsKey = skipSegmentsKey;
    }
    autoplayNextEpisodeEnabled() {
      return preferenceEnabledByDefault(this.autoplayKey);
    }
    skipSegmentsEnabled() {
      return preferenceEnabledByDefault(this.skipSegmentsKey);
    }
  }
  function preferenceEnabledByDefault(key) {
    const value = iina.preferences.get(key);
    return value === undefined || value === null ? true : Boolean(value);
  }

  // src/playback/segments.ts
  function normalizeSegments(segments, runtimeTicks, fallbackDurationSeconds) {
    const runtimeSeconds = runtimeTicks > 0 ? runtimeTicks / TICKS_PER_SECOND : 0;
    const resolvedRuntime = runtimeSeconds || Math.max(0, fallbackDurationSeconds);
    return segments.flatMap((segment) => {
      const type = segment.Type === "Intro" || segment.Type === "Outro" ? segment.Type : null;
      if (!type) {
        return [];
      }
      let startSeconds = typeof segment.StartTicks === "number" ? segment.StartTicks / TICKS_PER_SECOND : null;
      let endSeconds = typeof segment.EndTicks === "number" ? segment.EndTicks / TICKS_PER_SECOND : null;
      if (type === "Intro" && startSeconds === null && endSeconds !== null) {
        startSeconds = 0;
      }
      if (type === "Outro" && endSeconds === null && resolvedRuntime > 0) {
        endSeconds = resolvedRuntime;
      }
      return [{ type, startSeconds, endSeconds }];
    });
  }
  function getActiveSegment(positionSeconds, segments) {
    const activeSegments = segments.filter((segment) => segment.startSeconds !== null && segment.endSeconds !== null && positionSeconds >= segment.startSeconds && positionSeconds < segment.endSeconds);
    return activeSegments.find((segment) => segment.type === "Intro") || activeSegments[0] || null;
  }
  function shouldShowSkipOverlay(segment) {
    return Boolean(segment && segment.startSeconds !== null && segment.endSeconds !== null && segment.endSeconds > segment.startSeconds);
  }

  // src/jellyfin/url.ts
  function isHttpsUrl(url) {
    return url.trim().toLowerCase().startsWith("https://");
  }
  function normalizeServerUrl(url) {
    return url.trim().replace(/\/+$/, "");
  }

  // src/playback/controller.ts
  class PlaybackController {
    dependencies;
    model = {
      active: null,
      handoffs: new Map,
      resumeTimer: null,
      playbackTimer: null,
      playbackTickCount: 0,
      segmentTimer: null,
      skipEnabled: true,
      skipVisible: false,
      skipLabel: "",
      activeSkipSegment: null
    };
    constructor(dependencies) {
      this.dependencies = dependencies;
      dependencies.view.setSkipHandler(() => this.skipActiveSegment());
    }
    play(request) {
      const handoff = request?.playback;
      if (!handoff?.url) {
        return;
      }
      if (!isHttpsUrl(handoff.url) || !isHttpsUrl(handoff.serverUrl)) {
        this.dependencies.view.showHttpsAlert();
        return;
      }
      this.model.handoffs.set(handoff.url, {
        handoff,
        title: request.title || "",
        resumeSeconds: request.resumeSeconds || 0,
        resetPlaylist: true
      });
      this.dependencies.logger.debug("Jellyfin: Playing requested stream");
      this.stopActivePlayback("replacement requested");
      this.dependencies.player.loadReplacement(handoff, request.title || "");
      this.dependencies.view.hideSidebar();
    }
    onFileLoaded() {
      const path = this.dependencies.player.getPath();
      if (!path) {
        return;
      }
      if (path.includes("Jellyfin.png")) {
        this.dependencies.logger.debug("Jellyfin: Splash loaded, showing sidebar");
        this.clearPlaybackState("splash loaded");
        this.dependencies.view.showSidebar();
        this.dependencies.view.refreshSidebar();
        return;
      }
      const pending = this.takeHandoff(path);
      if (!pending) {
        this.clearPlaybackState("non-Jellyfin file loaded");
        return;
      }
      try {
        const playback = buildPlaybackSession(pending.handoff);
        if (!isHttpsUrl(playback.serverUrl)) {
          this.dependencies.logger.error("Jellyfin: Skipping HTTP playback reporting");
          this.clearPlaybackState("invalid Jellyfin server URL");
          return;
        }
        this.startPlaybackSession(playback, pending);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.dependencies.logger.debug("Jellyfin: Playback setup error:", message);
        this.clearPlaybackState("invalid Jellyfin handoff");
      }
    }
    onEndFile() {
      const active = this.model.active;
      if (!active) {
        return;
      }
      this.dependencies.logger.debug("Jellyfin: Playback ended");
      const autoplayQueued = active.autoplayQueued;
      this.stopActivePlayback("end of playback");
      if (!autoplayQueued) {
        this.handleNoNextEpisode("end of playback");
      }
    }
    onPauseChanged() {
      if (!this.model.active) {
        return;
      }
      this.updateLastKnownPosition();
      this.reportProgress();
    }
    onTrackChanged() {
      const active = this.model.active;
      if (!active) {
        return;
      }
      this.syncTrackSelection(active);
      if (active.reportingStarted) {
        this.reportProgress();
      }
    }
    onWindowClose() {
      this.clearPlaybackState("window close");
    }
    startPlaybackSession(session, pending) {
      this.dependencies.logger.debug("Jellyfin: Detected Jellyfin stream, starting playback reporting");
      this.stopActivePlayback("new Jellyfin file loaded");
      this.stopSegmentRuntime();
      const active = {
        session,
        lastKnownPositionTicks: 0,
        reportingStarted: false,
        autoplayQueued: false,
        nextItemId: "",
        segments: []
      };
      this.model.active = active;
      this.activateResume(active, pending.resumeSeconds);
      this.startPlaybackTick();
      if (pending.title) {
        this.dependencies.player.setWindowTitle(pending.title);
      }
      this.dependencies.player.loadExternalSubtitles(session);
      active.reportingStarted = true;
      this.reportStart(active);
      this.startSegmentPolling(active);
      if (pending.resetPlaylist) {
        this.prunePlaylistToCurrentEntry();
      }
      if (session.isEpisode && this.dependencies.preferences.autoplayNextEpisodeEnabled()) {
        this.requestAutoplay(active);
      }
    }
    async reportStart(active) {
      this.syncTrackSelection(active);
      this.dependencies.logger.debug("Jellyfin: Reporting playback start");
      try {
        await this.dependencies.api.reportStart(active.session, this.getPositionTicks());
      } catch (error) {
        this.logFailure("report playback start", error);
      }
    }
    async reportProgress() {
      const active = this.model.active;
      if (!active) {
        return;
      }
      this.syncTrackSelection(active);
      try {
        await this.dependencies.api.reportProgress(active.session, this.getPositionTicks(), this.dependencies.player.isPaused());
      } catch (error) {
        this.logFailure("report playback progress", error);
      }
    }
    async reportStopped(active, positionTicks) {
      this.dependencies.logger.debug("Jellyfin: Reporting playback stopped at position:", positionTicks / this.dependencies.config.ticksPerSecond);
      try {
        await this.dependencies.api.reportStopped(active.session, positionTicks);
      } catch (error) {
        this.logFailure("report playback stopped", error);
      }
    }
    startPlaybackTick() {
      this.stopPlaybackTick();
      this.model.playbackTimer = this.dependencies.clock.setInterval(() => this.onPlaybackTick(), this.dependencies.config.playbackTickIntervalMs);
    }
    onPlaybackTick() {
      const active = this.model.active;
      if (!active) {
        return;
      }
      this.updateLastKnownPosition();
      this.model.playbackTickCount += 1;
      const reportEvery = Math.max(1, this.dependencies.config.progressReportIntervalMs / this.dependencies.config.playbackTickIntervalMs);
      if (this.model.playbackTickCount >= reportEvery) {
        this.model.playbackTickCount = 0;
        this.reportProgress();
      }
      if (active.autoplayQueued) {
        return;
      }
      const duration = this.dependencies.player.getDurationSeconds();
      const position = this.dependencies.player.getPositionSeconds();
      if (!duration || duration <= 0 || !Number.isFinite(position)) {
        return;
      }
      if (duration - position > this.dependencies.config.eofWatchThresholdSeconds) {
        return;
      }
      if (!this.dependencies.player.isPaused() && !this.dependencies.player.isEofReached()) {
        return;
      }
      this.dependencies.logger.debug("Jellyfin: Playback reached EOF (tick)");
      this.stopActivePlayback("EOF tick");
      this.handleNoNextEpisode("eof tick");
    }
    stopPlaybackTick() {
      if (this.model.playbackTimer === null) {
        return;
      }
      this.dependencies.clock.clearInterval(this.model.playbackTimer);
      this.model.playbackTimer = null;
    }
    stopActivePlayback(reason) {
      const active = this.model.active;
      if (!active) {
        return null;
      }
      const currentPosition = this.getPositionTicks();
      if (currentPosition > 0) {
        active.lastKnownPositionTicks = currentPosition;
      }
      const positionTicks = currentPosition || active.lastKnownPositionTicks || 0;
      this.model.active = null;
      this.dependencies.logger.debug(`Jellyfin: Stopping playback (${reason})`);
      this.cancelResume();
      this.resetPlaybackRuntime();
      this.reportStopped(active, positionTicks);
      return active;
    }
    clearPlaybackState(reason) {
      if (this.model.active || this.model.handoffs.size > 0) {
        this.dependencies.logger.debug(`Jellyfin: Clearing playback state (${reason})`);
      }
      this.stopActivePlayback(reason);
      this.cancelResume();
      this.resetPlaybackRuntime();
      this.model.handoffs.clear();
    }
    resetPlaybackRuntime() {
      this.stopPlaybackTick();
      this.stopSegmentRuntime();
      this.model.playbackTickCount = 0;
    }
    updateLastKnownPosition() {
      const active = this.model.active;
      const positionTicks = this.getPositionTicks();
      if (active && positionTicks > 0) {
        active.lastKnownPositionTicks = positionTicks;
      }
    }
    getPositionTicks() {
      return Math.floor((this.dependencies.player.getPositionSeconds() || 0) * this.dependencies.config.ticksPerSecond);
    }
    activateResume(active, seconds) {
      this.cancelResume();
      if (!Number.isFinite(seconds) || seconds <= 0) {
        return;
      }
      this.model.resumeTimer = this.dependencies.clock.setTimeout(() => {
        this.model.resumeTimer = null;
        if (this.model.active === active) {
          this.dependencies.player.seek(seconds);
        }
      }, this.dependencies.config.resumeSeekDelayMs);
      this.dependencies.logger.debug("Jellyfin: Will resume matching session after file load");
    }
    cancelResume() {
      if (this.model.resumeTimer !== null) {
        this.dependencies.clock.clearTimeout(this.model.resumeTimer);
        this.model.resumeTimer = null;
      }
    }
    async requestAutoplay(active) {
      active.autoplayQueued = false;
      try {
        const result = await this.dependencies.api.resolveNextEpisode(active.session);
        if (this.model.active !== active) {
          return;
        }
        active.nextItemId = result?.handoff.itemId || "";
        if (result) {
          this.queueNextEpisode(active, result.handoff, result.title);
        }
      } catch (error) {
        if (this.model.active === active) {
          active.nextItemId = "";
          active.autoplayQueued = false;
        }
        this.logFailure("autoplay lookup", error);
      }
    }
    queueNextEpisode(active, handoff, title) {
      try {
        const playlist = this.dependencies.player.getPlaylist();
        const currentIndex = findCurrentPlaylistIndex(playlist);
        if (currentIndex !== -1) {
          const nextUrl = playlist[currentIndex + 1]?.filename || "";
          const nextItemId = this.model.handoffs.get(nextUrl)?.handoff.itemId || "";
          if (nextItemId && nextItemId === active.nextItemId) {
            active.autoplayQueued = true;
            return;
          }
          for (let index = playlist.length - 1;index > currentIndex; index -= 1) {
            this.dependencies.player.removePlaylistEntry(index);
          }
        }
        this.model.handoffs.set(handoff.url, {
          handoff,
          title,
          resumeSeconds: 0,
          resetPlaylist: false
        });
        this.dependencies.player.loadNext(handoff, title);
        active.autoplayQueued = true;
        this.dependencies.logger.debug("Jellyfin: Queued next episode");
      } catch (error) {
        this.logFailure("queue next episode", error);
      }
    }
    prunePlaylistToCurrentEntry() {
      const playlist = this.dependencies.player.getPlaylist();
      const currentIndex = findCurrentPlaylistIndex(playlist);
      if (currentIndex === -1) {
        return;
      }
      for (let index = playlist.length - 1;index >= 0; index -= 1) {
        if (index !== currentIndex) {
          this.dependencies.player.removePlaylistEntry(index);
        }
      }
    }
    startSegmentPolling(active) {
      this.stopSegmentRuntime();
      this.model.skipEnabled = this.dependencies.preferences.skipSegmentsEnabled();
      if (this.model.skipEnabled) {
        this.requestSegments(active);
      }
      this.model.segmentTimer = this.dependencies.clock.setInterval(() => this.onSegmentTick(active), this.dependencies.config.skipSegmentPollIntervalMs);
    }
    onSegmentTick(active) {
      if (this.model.active !== active) {
        return;
      }
      this.refreshSkipPreference(active);
      if (!this.model.skipEnabled) {
        this.hideSkipOverlay();
        return;
      }
      const segment = getActiveSegment(this.dependencies.player.getPositionSeconds(), active.segments);
      if (!shouldShowSkipOverlay(segment)) {
        this.hideSkipOverlay();
        return;
      }
      this.model.activeSkipSegment = segment;
      this.showSkipOverlay(getSkipLabel(segment));
    }
    refreshSkipPreference(active) {
      const enabled = this.dependencies.preferences.skipSegmentsEnabled();
      if (enabled === this.model.skipEnabled) {
        return;
      }
      this.model.skipEnabled = enabled;
      if (!enabled) {
        this.hideSkipOverlay();
      } else {
        this.requestSegments(active);
      }
    }
    async requestSegments(active) {
      if (!active.session.isEpisode) {
        active.segments = [];
        return;
      }
      try {
        const segments = await this.dependencies.api.getSegments(active.session);
        if (this.model.active === active) {
          active.segments = resolveSegmentDuration(segments, this.dependencies.player.getDurationSeconds());
        }
      } catch (error) {
        if (this.model.active === active) {
          active.segments = [];
        }
        this.logFailure("fetch media segments", error);
      }
    }
    stopSegmentRuntime() {
      if (this.model.segmentTimer !== null) {
        this.dependencies.clock.clearInterval(this.model.segmentTimer);
        this.model.segmentTimer = null;
      }
      this.hideSkipOverlay();
      this.model.activeSkipSegment = null;
      if (this.model.active) {
        this.model.active.segments = [];
      }
    }
    skipActiveSegment() {
      const target = this.model.activeSkipSegment?.endSeconds;
      if (typeof target === "number" && target > 0) {
        this.dependencies.player.seek(Math.max(0, target + 0.5));
      }
      this.hideSkipOverlay();
    }
    showSkipOverlay(label) {
      if (this.model.skipVisible && label === this.model.skipLabel) {
        return;
      }
      this.model.skipLabel = label;
      this.dependencies.view.showSkipButton(label);
      this.model.skipVisible = true;
    }
    hideSkipOverlay() {
      if (!this.model.skipVisible) {
        this.model.activeSkipSegment = null;
        return;
      }
      this.dependencies.view.hideSkipButton();
      this.model.skipVisible = false;
      this.model.skipLabel = "";
      this.model.activeSkipSegment = null;
    }
    syncTrackSelection(active) {
      const selection = this.dependencies.player.getTrackSelection(active.session);
      active.session.audioStreamIndex = selection.audioStreamIndex;
      active.session.subtitleStreamIndex = selection.subtitleStreamIndex;
    }
    takeHandoff(url) {
      const pending = this.model.handoffs.get(url) || null;
      if (pending) {
        this.model.handoffs.delete(url);
      }
      return pending;
    }
    handleNoNextEpisode(reason) {
      this.dependencies.logger.debug("Jellyfin: No next episode:", reason);
      try {
        this.dependencies.player.open(this.dependencies.config.splashUrl);
      } catch (error) {
        this.logFailure("open splash", error);
      }
      this.dependencies.view.showSidebar();
      this.dependencies.view.refreshSidebar();
    }
    logFailure(action, error) {
      const message = error instanceof Error ? error.message : String(error);
      this.dependencies.logger.error(`Jellyfin: Failed to ${action}: ${message}`);
    }
  }
  function buildPlaybackSession(handoff) {
    const { url: _url, ...context } = handoff;
    return {
      ...context,
      isEpisode: Boolean(context.seriesId || context.episodeIndex !== null && context.episodeIndex !== undefined)
    };
  }
  function findCurrentPlaylistIndex(playlist) {
    return playlist.findIndex((entry) => Boolean(entry && (entry.current || entry.playing)));
  }
  function getSkipLabel(segment) {
    if (segment?.type === "Intro") {
      return "Skip Intro";
    }
    if (segment?.type === "Outro") {
      return "Skip Credits";
    }
    return "Skip";
  }
  function resolveSegmentDuration(segments, durationSeconds) {
    if (!durationSeconds || durationSeconds <= 0) {
      return segments;
    }
    return segments.map((segment) => segment.type === "Outro" && segment.endSeconds === null ? { ...segment, endSeconds: durationSeconds } : segment);
  }

  // src/jellyfin/images.ts
  function buildJellyfinImageUrl(options) {
    if (!options.serverUrl || !options.itemId) {
      return "";
    }
    const baseUrl = normalizeServerUrl(options.serverUrl);
    const imageType = options.imageType || "Primary";
    const imageIndex = options.imageIndex === undefined ? "" : `/${options.imageIndex}`;
    const endpoint = `${baseUrl}/Items/${encodeURIComponent(options.itemId)}` + `/Images/${encodeURIComponent(imageType)}${imageIndex}`;
    const query = [
      `maxWidth=${encodeURIComponent(String(options.maxWidth || 120))}`,
      "quality=90"
    ];
    if (options.imageTag) {
      query.push(`tag=${encodeURIComponent(options.imageTag)}`);
    }
    if (options.accessToken) {
      query.push(`api_key=${encodeURIComponent(options.accessToken)}`);
    }
    return `${endpoint}?${query.join("&")}`;
  }

  // src/jellyfin/session.ts
  var authState = null;
  function updateAuthState(payload) {
    authState = {
      ...payload,
      serverUrl: normalizeServerUrl(payload.serverUrl)
    };
    return authState;
  }
  function clearAuthState() {
    authState = null;
  }
  function getAuthState() {
    return authState;
  }

  // src/adapters/iina/mediaOverlay.ts
  var { event, overlay } = iina;
  var OVERLAY_HIDE_DELAY_MS = 450;
  var initialized = false;
  var overlayReady = false;
  var backdropEligible = false;
  var playlistItemIds = [];
  var overrideItemId = "";
  var skipButtonLabel = "";
  var skipSegmentHandler = null;
  var overlayHideTimer = null;
  function clearOverlayHideTimer() {
    if (!overlayHideTimer) {
      return;
    }
    clearTimeout(overlayHideTimer);
    overlayHideTimer = null;
  }
  function scheduleOverlayHide() {
    clearOverlayHideTimer();
    overlayHideTimer = setTimeout(() => {
      overlayHideTimer = null;
      overlay.hide();
    }, OVERLAY_HIDE_DELAY_MS);
  }
  function syncOverlay() {
    if (!overlayReady) {
      return;
    }
    const playlistUrls = playlistItemIds.map(buildBackdropUrl).filter(Boolean);
    const overrideUrl = overrideItemId ? buildBackdropUrl(overrideItemId) : "";
    const shouldShowOverlay = backdropEligible && (playlistUrls.length > 0 || overrideUrl) || Boolean(skipButtonLabel);
    if (shouldShowOverlay) {
      clearOverlayHideTimer();
      overlay.show();
    }
    overlay.postMessage(MESSAGE_NAMES.OverlayBackdrops, {
      playlistUrls,
      overrideUrl,
      eligible: backdropEligible
    });
    overlay.postMessage(MESSAGE_NAMES.OverlaySkipButton, {
      label: skipButtonLabel
    });
    overlay.setClickable(Boolean(skipButtonLabel));
    if (!shouldShowOverlay) {
      scheduleOverlayHide();
    }
  }
  function initializeMediaOverlay() {
    if (initialized) {
      return;
    }
    initialized = true;
    event.on("iina.plugin-overlay-loaded", () => {
      overlayReady = true;
      overlay.onMessage(MESSAGE_NAMES.SkipSegment, () => {
        skipSegmentHandler?.();
      });
      syncOverlay();
    });
    event.on("iina.window-will-close", clearOverlayHideTimer);
  }
  function loadMediaOverlay() {
    clearOverlayHideTimer();
    overlayReady = false;
    overlay.loadFile("ui/overlay.html");
  }
  function setBackdropEligibility(eligible) {
    if (backdropEligible === eligible) {
      return;
    }
    backdropEligible = eligible;
    syncOverlay();
  }
  function setBackdropContext(payload) {
    playlistItemIds = Array.from(new Set((payload?.itemIds || []).filter((itemId) => typeof itemId === "string" && Boolean(itemId))));
    overrideItemId = typeof payload?.overrideItemId === "string" ? payload.overrideItemId : "";
    syncOverlay();
  }
  function clearBackdropContext() {
    playlistItemIds = [];
    overrideItemId = "";
    syncOverlay();
  }
  function refreshMediaOverlay() {
    syncOverlay();
  }
  function buildBackdropUrl(itemId) {
    const authState2 = getAuthState();
    if (!authState2) {
      return "";
    }
    return buildJellyfinImageUrl({
      serverUrl: authState2.serverUrl,
      accessToken: authState2.accessToken,
      itemId,
      imageType: "Backdrop",
      imageIndex: 0,
      maxWidth: 1920
    });
  }
  function showSkipButton(label) {
    skipButtonLabel = label;
    syncOverlay();
  }
  function hideSkipButton() {
    skipButtonLabel = "";
    syncOverlay();
  }
  function setSkipSegmentHandler(handler) {
    skipSegmentHandler = handler;
  }

  // src/adapters/iina/httpTransport.ts
  function createIinaHttpTransport(http) {
    return {
      async send(request) {
        const options = {
          params: {},
          headers: request.headers,
          data: request.body === undefined ? null : request.body
        };
        const response = await sendIinaRequest(http, request.method, request.url, options);
        return {
          status: response.statusCode || 0,
          statusText: response.reason || "",
          data: response.data,
          text: response.text
        };
      }
    };
  }
  function sendIinaRequest(http, method, url, options) {
    switch (method) {
      case "GET":
        return http.get(url, options);
      case "POST":
        return http.post(url, options);
      case "PUT":
        return http.put(url, options);
      case "PATCH":
        return http.patch(url, options);
      case "DELETE":
        return http.delete(url, options);
    }
  }

  // src/jellyfin/auth.ts
  function buildMediaBrowserAuthorizationHeader(options) {
    const parts = [
      `Client="${options.clientName}"`,
      `Device="${options.deviceName}"`,
      `DeviceId="${options.deviceId}"`,
      `Version="${options.version}"`
    ];
    if (options.token) {
      parts.push(`Token="${options.token}"`);
    }
    return `MediaBrowser ${parts.join(", ")}`;
  }

  // src/jellyfin/client.ts
  class JellyfinHttpError extends Error {
    status;
    endpoint;
    statusText;
    responseText;
    constructor(status, endpoint, statusText, responseText) {
      super(`Jellyfin request failed (${status}) for ${endpoint}.`);
      this.status = status;
      this.endpoint = endpoint;
      this.statusText = statusText;
      this.responseText = responseText;
      this.name = "JellyfinHttpError";
    }
  }

  class JellyfinJsonError extends Error {
    endpoint;
    snippet;
    constructor(endpoint, snippet) {
      super(`Expected JSON response for ${endpoint} but got: ${snippet}`.trim());
      this.endpoint = endpoint;
      this.snippet = snippet;
      this.name = "JellyfinJsonError";
    }
  }

  class JellyfinClient {
    transport;
    identity;
    constructor(transport, identity) {
      this.transport = transport;
      this.identity = identity;
    }
    async requestJson(connection, options) {
      const response = await this.send(connection, options);
      if (response.data !== undefined && response.data !== null) {
        if (typeof response.data !== "string") {
          return response.data;
        }
        return this.parseJson(options.endpoint, response.data);
      }
      const responseText = response.text ? String(response.text).trim() : "";
      if (!responseText) {
        return null;
      }
      return this.parseJson(options.endpoint, responseText);
    }
    async send(connection, options) {
      const request = this.buildRequest(connection, options);
      const response = await this.transport.send(request);
      if (response.status < 200 || response.status >= 300) {
        throw new JellyfinHttpError(response.status, options.endpoint, response.statusText, response.text ? String(response.text) : "");
      }
      return response;
    }
    buildRequest(connection, options) {
      const serverUrl = normalizeServerUrl(connection.serverUrl);
      if (!isHttpsUrl(serverUrl)) {
        throw new Error("Jellyfin server URL must start with https://");
      }
      const endpoint = options.endpoint.startsWith("/") ? options.endpoint : `/${options.endpoint}`;
      const queryString = buildQueryString(options.query);
      const headers = {
        Authorization: buildMediaBrowserAuthorizationHeader({
          clientName: this.identity.clientName,
          deviceName: this.identity.deviceName,
          deviceId: connection.deviceId,
          version: this.identity.version,
          token: connection.accessToken
        }),
        ...options.headers || {}
      };
      if (options.body !== undefined) {
        headers["Content-Type"] = "application/json";
      }
      return {
        method: options.method,
        url: `${serverUrl}${endpoint}${queryString ? `?${queryString}` : ""}`,
        headers,
        ...options.body !== undefined ? { body: options.body } : {}
      };
    }
    parseJson(endpoint, responseText) {
      try {
        return JSON.parse(responseText);
      } catch (error) {
        throw new JellyfinJsonError(endpoint, responseText.slice(0, 200));
      }
    }
  }
  function buildQueryString(query) {
    if (!query) {
      return "";
    }
    const parts = [];
    Object.keys(query).forEach((key) => {
      const value = query[key];
      if (value === undefined || value === null) {
        return;
      }
      const values = Array.isArray(value) ? value : [value];
      values.forEach((entry) => {
        parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(entry))}`);
      });
    });
    return parts.join("&");
  }

  // src/adapters/iina/apiClient.ts
  var { http } = iina;
  var client = new JellyfinClient(createIinaHttpTransport(http), {
    clientName: CLIENT_NAME,
    deviceName: DEVICE_NAME,
    version: CLIENT_VERSION
  });
  async function requestJson(context, options) {
    try {
      return await client.requestJson(context, options);
    } catch (error) {
      throw mapClientError(error);
    }
  }
  function mapClientError(error) {
    if (error instanceof JellyfinHttpError) {
      const detail = error.responseText ? ` - ${error.responseText.slice(0, 200)}` : "";
      return new Error(`HTTP ${error.status} ${error.statusText}${detail}`.trim());
    }
    if (error instanceof JellyfinJsonError) {
      return new Error(`Expected JSON response but got: ${error.snippet}`.trim());
    }
    return error;
  }

  // src/playback/episodeOrder.ts
  function hasIndex(item) {
    return typeof item.IndexNumber === "number" && Number.isFinite(item.IndexNumber);
  }
  function sortByIndex(items) {
    return [...items].sort((a, b) => {
      if (!hasIndex(a)) {
        return hasIndex(b) ? 1 : 0;
      }
      if (!hasIndex(b)) {
        return -1;
      }
      return a.IndexNumber - b.IndexNumber;
    });
  }
  function findNextEpisodeInSeason(episodes, currentEpisodeIndex) {
    return sortByIndex(episodes).find((episode) => hasIndex(episode) && episode.IndexNumber > currentEpisodeIndex) || null;
  }
  function findFirstEpisodeInSeason(episodes) {
    return sortByIndex(episodes)[0] || null;
  }
  function getFollowingSeasons(seasons, currentSeasonId) {
    const sortedSeasons = sortByIndex(seasons);
    const currentIndex = sortedSeasons.findIndex((season) => season.Id === currentSeasonId);
    return currentIndex === -1 ? [] : sortedSeasons.slice(currentIndex + 1);
  }

  // src/jellyfin/deviceProfile.ts
  var IINA_DEVICE_PROFILE = {
    MaxStreamingBitrate: 2147483647,
    MaxStaticBitrate: 2147483647,
    MusicStreamingTranscodingBitrate: 2147483647,
    DirectPlayProfiles: [
      { Container: "", Type: "Video" },
      { Container: "", Type: "Audio" }
    ],
    TranscodingProfiles: [],
    ContainerProfiles: [],
    CodecProfiles: [],
    SubtitleProfiles: [
      { Format: "srt", Method: "External" },
      { Format: "ass", Method: "External" },
      { Format: "ssa", Method: "External" },
      { Format: "vtt", Method: "External" }
    ]
  };

  // src/playback/negotiation.ts
  var EPISODE_TITLE_SEPARATOR = " • ";
  function buildJellyfinStreamUrl(options) {
    if (!options.serverUrl || !options.itemId) {
      return "";
    }
    const baseUrl = normalizeServerUrl(options.serverUrl);
    const mediaSourceId = options.mediaSourceId || options.itemId;
    const params = {
      Static: "true",
      mediaSourceId,
      playSessionId: options.playSessionId || "",
      api_key: options.accessToken
    };
    const queryString = buildQueryString2(params);
    return `${baseUrl}/Videos/${encodeURIComponent(options.itemId)}/stream?${queryString}`;
  }
  function buildPlaybackInfoRequest(userId, deviceProfile) {
    return {
      UserId: userId,
      DeviceProfile: deviceProfile,
      EnableDirectPlay: true,
      EnableDirectStream: true,
      EnableTranscoding: true,
      AllowVideoStreamCopy: true,
      AllowAudioStreamCopy: true
    };
  }
  function selectPlayableMediaSource(playbackInfo) {
    const mediaSource = playbackInfo.MediaSources?.find((source) => Boolean(source.Id) && (source.SupportsDirectPlay === true || Boolean(source.TranscodingUrl)));
    if (mediaSource) {
      return mediaSource;
    }
    const errorCode = playbackInfo.ErrorCode ? ` (${playbackInfo.ErrorCode})` : "";
    throw new Error(`Jellyfin did not provide a playable media source${errorCode}.`);
  }
  function buildPlaybackHandoff(playbackInfo, options) {
    const playSessionId = playbackInfo.PlaySessionId || "";
    if (!playSessionId) {
      throw new Error("Jellyfin did not provide a playback session.");
    }
    const mediaSource = selectPlayableMediaSource(playbackInfo);
    const mediaSourceId = mediaSource.Id || "";
    const directPlay = mediaSource.SupportsDirectPlay === true;
    const url = directPlay ? buildJellyfinStreamUrl({ ...options, mediaSourceId, playSessionId }) : buildAuthenticatedDeliveryUrl(options.serverUrl, mediaSource.TranscodingUrl || "", options.accessToken);
    if (!url) {
      throw new Error("Jellyfin returned incomplete playback information.");
    }
    return {
      url,
      serverUrl: normalizeServerUrl(options.serverUrl),
      accessToken: options.accessToken,
      deviceId: options.deviceId,
      userId: options.userId,
      itemId: options.itemId,
      mediaSourceId,
      playSessionId,
      runtimeTicks: mediaSource.RunTimeTicks || options.runtimeTicks || 0,
      playMethod: directPlay ? "DirectPlay" : resolveTranscodingPlayMethod(mediaSource),
      audioStreamIndex: mediaSource.DefaultAudioStreamIndex,
      subtitleStreamIndex: mediaSource.DefaultSubtitleStreamIndex,
      externalSubtitles: buildExternalSubtitleTracks(mediaSource, options.serverUrl, options.accessToken),
      seriesId: options.seriesId,
      seasonId: options.seasonId,
      episodeIndex: options.episodeIndex
    };
  }
  function resolveTranscodingPlayMethod(mediaSource) {
    const transcodingUrl = mediaSource.TranscodingUrl || "";
    const videoCodec = getQueryParameter(transcodingUrl, "VideoCodec").toLowerCase();
    if (videoCodec === "copy") {
      return "DirectStream";
    }
    const hasVideo = (mediaSource.MediaStreams || []).some((stream) => stream.Type === "Video");
    const audioCodec = getQueryParameter(transcodingUrl, "AudioCodec").toLowerCase();
    if (!hasVideo && audioCodec === "copy") {
      return "DirectStream";
    }
    return "Transcode";
  }
  function buildExternalSubtitleTracks(mediaSource, serverUrl, accessToken) {
    return (mediaSource.MediaStreams || []).filter(isExternalSubtitleStream).map((stream) => buildExternalSubtitleTrack(stream, mediaSource.DefaultSubtitleStreamIndex, serverUrl, accessToken)).filter((track) => track !== null);
  }
  function isExternalSubtitleStream(stream) {
    return stream.Type === "Subtitle" && stream.DeliveryMethod === "External" && typeof stream.Index === "number" && Boolean(stream.DeliveryUrl);
  }
  function buildExternalSubtitleTrack(stream, defaultSubtitleStreamIndex, serverUrl, accessToken) {
    const index = stream.Index;
    const deliveryUrl = stream.DeliveryUrl || "";
    if (index === undefined || !deliveryUrl) {
      return null;
    }
    const url = buildAuthenticatedDeliveryUrl(serverUrl, deliveryUrl, accessToken);
    if (!url) {
      return null;
    }
    return {
      index,
      url,
      title: stream.DisplayTitle || stream.Title || stream.Language || `Subtitle ${index}`,
      language: stream.Language || "",
      isDefault: defaultSubtitleStreamIndex === index,
      isForced: Boolean(stream.IsForced),
      isHearingImpaired: Boolean(stream.IsHearingImpaired)
    };
  }
  function buildAuthenticatedDeliveryUrl(serverUrl, deliveryUrl, accessToken) {
    const baseUrl = normalizeServerUrl(serverUrl);
    const trimmedDeliveryUrl = deliveryUrl.trim();
    if (!baseUrl || !trimmedDeliveryUrl) {
      return "";
    }
    const isAbsolute = /^https?:\/\//i.test(trimmedDeliveryUrl);
    const resolvedUrl = isAbsolute ? trimmedDeliveryUrl : `${baseUrl}/${trimmedDeliveryUrl.replace(/^\/+/, "")}`;
    if (!/^https:\/\//i.test(resolvedUrl)) {
      return "";
    }
    const serverOrigin = getHttpOrigin(baseUrl);
    const deliveryOrigin = getHttpOrigin(resolvedUrl);
    if (!accessToken || !serverOrigin || serverOrigin !== deliveryOrigin || hasAccessToken(resolvedUrl)) {
      return resolvedUrl;
    }
    return appendQueryParameter(resolvedUrl, "api_key", accessToken);
  }
  function getHttpOrigin(url) {
    const match = url.match(/^https?:\/\/[^/?#]+/i);
    return match ? match[0].toLowerCase() : "";
  }
  function hasAccessToken(url) {
    return /[?&](?:api_key|access_token|x-emby-token)=/i.test(url);
  }
  function getQueryParameter(url, requestedKey) {
    const queryStart = url.indexOf("?");
    if (queryStart === -1) {
      return "";
    }
    const queryEnd = url.indexOf("#", queryStart);
    const query = url.substring(queryStart + 1, queryEnd === -1 ? url.length : queryEnd);
    for (const pair of query.split("&")) {
      const separator = pair.indexOf("=");
      const rawKey = separator === -1 ? pair : pair.substring(0, separator);
      if (decodeQueryValue(rawKey).toLowerCase() !== requestedKey.toLowerCase()) {
        continue;
      }
      return decodeQueryValue(separator === -1 ? "" : pair.substring(separator + 1));
    }
    return "";
  }
  function decodeQueryValue(value) {
    try {
      return decodeURIComponent(value.replace(/\+/g, " "));
    } catch (error) {
      return value;
    }
  }
  function appendQueryParameter(url, key, value) {
    const fragmentIndex = url.indexOf("#");
    const fragment = fragmentIndex === -1 ? "" : url.substring(fragmentIndex);
    const urlWithoutFragment = fragmentIndex === -1 ? url : url.substring(0, fragmentIndex);
    const separator = urlWithoutFragment.includes("?") ? "&" : "?";
    return `${urlWithoutFragment}${separator}${encodeURIComponent(key)}=${encodeURIComponent(value)}${fragment}`;
  }
  function buildJellyfinWindowTitle(item, fallbackName) {
    if (!item) {
      return fallbackName || "";
    }
    const name = item.Name || fallbackName || "";
    if (item.Type === "Episode") {
      return buildEpisodeWindowTitle(item, name);
    }
    if (item.Type === "Movie") {
      return buildMovieWindowTitle(item, name);
    }
    return name;
  }
  function buildEpisodeWindowTitle(item, name) {
    const episodeCode = `S${formatTitleIndex(item.ParentIndexNumber)}E${formatTitleIndex(item.IndexNumber)}`;
    return [item.SeriesName || "", episodeCode, name].filter(Boolean).join(EPISODE_TITLE_SEPARATOR);
  }
  function buildMovieWindowTitle(item, name) {
    const year = item.ProductionYear ? ` (${item.ProductionYear})` : "";
    return `${name}${year}`;
  }
  function formatTitleIndex(index) {
    return index === null || index === undefined ? "00" : String(index).padStart(2, "0");
  }
  function buildQueryString2(params) {
    const parts = [];
    Object.keys(params).forEach((key) => {
      const value = params[key];
      if (value === undefined || value === null) {
        return;
      }
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
    });
    return parts.join("&");
  }

  // src/jellyfin/fields.ts
  var FIELDS_EPISODES = "Overview,MediaSources,UserData,RunTimeTicks,SeriesName,ParentIndexNumber,IndexNumber,SeriesId,SeasonId";
  var FIELDS_SEASONS = "Overview,UserData,RunTimeTicks,IndexNumber";
  var ITEM_DETAILS_FIELDS = "Overview,Taglines,Genres,MediaSources,UserData,RunTimeTicks,OfficialRating,ProductionYear,PremiereDate,EndDate,Status,RecursiveItemCount,ChildCount,ParentIndexNumber,IndexNumber,SeriesName,SeriesId,SeasonId,ParentId,Type,Name";

  // src/adapters/iina/autoplayResolver.ts
  function createAutoplayResolver(port) {
    return async function resolveAutoplayNextEpisode(playback) {
      if (!hasPlaybackContext(playback)) {
        return null;
      }
      const itemDetails = await fetchItemDetails(port, playback, playback.itemId);
      if (!itemDetails || itemDetails.Type !== "Episode") {
        return null;
      }
      const location = resolveEpisodeLocation(playback, itemDetails);
      if (!location) {
        return null;
      }
      const nextEpisode = await resolveSequentialNextEpisode(port, playback, location);
      if (!nextEpisode?.Id || nextEpisode.Id === playback.itemId) {
        return null;
      }
      return buildAutoplayStream(port, playback, nextEpisode.Id, {
        seriesId: nextEpisode.SeriesId || location.seriesId,
        seasonId: nextEpisode.SeasonId || nextEpisode.ParentId || location.seasonId,
        episodeIndex: nextEpisode.IndexNumber ?? undefined
      });
    };
  }
  function resolveEpisodeLocation(playback, item) {
    const seriesId = playback.seriesId || item.SeriesId || "";
    const seasonId = playback.seasonId || item.SeasonId || item.ParentId || "";
    const episodeIndex = Number.parseInt(String(playback.episodeIndex ?? item.IndexNumber), 10);
    if (!seriesId || !seasonId || Number.isNaN(episodeIndex)) {
      return null;
    }
    return { seriesId, seasonId, episodeIndex };
  }
  async function fetchItemDetails(port, playback, itemId) {
    return port.requestJson(playback, {
      method: "GET",
      endpoint: `/Items/${encodeURIComponent(itemId)}`,
      query: {
        userId: playback.userId,
        fields: ITEM_DETAILS_FIELDS
      }
    });
  }
  async function fetchEpisodes(port, playback, seriesId, seasonId) {
    const result = await port.requestJson(playback, {
      method: "GET",
      endpoint: `/Shows/${encodeURIComponent(seriesId)}/Episodes`,
      query: {
        userId: playback.userId,
        seasonId,
        fields: FIELDS_EPISODES
      }
    });
    return (result?.Items || []).filter((item) => item.Type === "Episode");
  }
  async function fetchSeasons(port, playback, seriesId) {
    const result = await port.requestJson(playback, {
      method: "GET",
      endpoint: `/Shows/${encodeURIComponent(seriesId)}/Seasons`,
      query: {
        userId: playback.userId,
        fields: FIELDS_SEASONS
      }
    });
    return result?.Items || [];
  }
  async function resolveSequentialNextEpisode(port, playback, location) {
    const nextEpisode = findNextEpisodeInSeason(await fetchEpisodes(port, playback, location.seriesId, location.seasonId), location.episodeIndex);
    if (nextEpisode) {
      return nextEpisode;
    }
    const seasons = await fetchSeasons(port, playback, location.seriesId);
    for (const nextSeason of getFollowingSeasons(seasons, location.seasonId)) {
      const firstEpisode = await findFirstEpisodeInNextSeason(port, playback, location.seriesId, nextSeason);
      if (firstEpisode) {
        return firstEpisode;
      }
    }
    return null;
  }
  async function findFirstEpisodeInNextSeason(port, playback, seriesId, season) {
    if (!season.Id) {
      return null;
    }
    return findFirstEpisodeInSeason(await fetchEpisodes(port, playback, seriesId, season.Id));
  }
  async function buildAutoplayStream(port, playback, itemId, context) {
    const playbackInfo = await port.requestJson(playback, {
      method: "POST",
      endpoint: `/Items/${encodeURIComponent(itemId)}/PlaybackInfo`,
      body: buildPlaybackInfoRequest(playback.userId, IINA_DEVICE_PROFILE)
    });
    if (!playbackInfo) {
      throw new Error("Missing playback info");
    }
    const itemDetails = await fetchItemDetails(port, playback, itemId);
    return {
      handoff: buildPlaybackHandoff(playbackInfo, {
        serverUrl: playback.serverUrl,
        accessToken: playback.accessToken,
        deviceId: playback.deviceId,
        userId: playback.userId,
        itemId,
        runtimeTicks: itemDetails?.RunTimeTicks,
        seriesId: context.seriesId,
        seasonId: context.seasonId,
        episodeIndex: context.episodeIndex ?? undefined
      }),
      title: buildJellyfinWindowTitle(itemDetails, itemDetails?.Name || "")
    };
  }
  function hasPlaybackContext(playback) {
    return Boolean(playback.serverUrl && playback.accessToken && playback.deviceId && playback.userId);
  }

  // src/adapters/iina/autoplay.ts
  var resolveAutoplayNextEpisode = createAutoplayResolver({ requestJson });

  // src/adapters/iina/segmentsApi.ts
  async function requestMediaSegments(playback) {
    if (!playback.isEpisode || !playback.itemId || !playback.serverUrl || !playback.accessToken || !playback.deviceId) {
      return [];
    }
    const result = await requestJson(playback, {
      method: "GET",
      endpoint: `/MediaSegments/${encodeURIComponent(playback.itemId)}` + "?includeSegmentTypes=Intro&includeSegmentTypes=Outro"
    });
    const segments = (result?.Items || []).map((segment) => ({
      Type: segment.Type,
      StartTicks: segment.StartTicks,
      EndTicks: segment.EndTicks
    }));
    return normalizeSegments(segments, playback.runtimeTicks, 0);
  }

  // src/adapters/iina/playbackApi.ts
  class IinaPlaybackApi {
    async reportStart(playback, positionTicks) {
      const context = playback;
      if (!hasHttpContext(context)) {
        return;
      }
      const body = {
        ItemId: context.itemId,
        MediaSourceId: context.mediaSourceId,
        PlaySessionId: context.playSessionId,
        PositionTicks: positionTicks,
        CanSeek: true,
        IsPaused: false,
        PlayMethod: context.playMethod,
        AudioStreamIndex: context.audioStreamIndex,
        SubtitleStreamIndex: context.subtitleStreamIndex
      };
      await requestJson(context, {
        method: "POST",
        endpoint: "/Sessions/Playing",
        body
      });
    }
    async reportProgress(playback, positionTicks, isPaused) {
      const context = playback;
      if (!hasHttpContext(context)) {
        return;
      }
      const body = {
        ItemId: context.itemId,
        MediaSourceId: context.mediaSourceId,
        PlaySessionId: context.playSessionId,
        PositionTicks: positionTicks,
        IsPaused: Boolean(isPaused),
        PlayMethod: context.playMethod,
        AudioStreamIndex: context.audioStreamIndex,
        SubtitleStreamIndex: context.subtitleStreamIndex
      };
      await requestJson(context, {
        method: "POST",
        endpoint: "/Sessions/Playing/Progress",
        body
      });
    }
    async reportStopped(playback, positionTicks) {
      const context = playback;
      if (!hasHttpContext(context)) {
        return;
      }
      const body = {
        ItemId: context.itemId,
        MediaSourceId: context.mediaSourceId,
        PlaySessionId: context.playSessionId,
        PositionTicks: positionTicks
      };
      await requestJson(context, {
        method: "POST",
        endpoint: "/Sessions/Playing/Stopped",
        body
      });
    }
    resolveNextEpisode(playback) {
      return resolveAutoplayNextEpisode(playback);
    }
    getSegments(playback) {
      return requestMediaSegments(playback);
    }
  }
  function hasHttpContext(playback) {
    return Boolean(playback.serverUrl && playback.accessToken && playback.deviceId);
  }

  // src/adapters/iina/utils.ts
  function logDebug(...args) {
    if (DEBUG_LOGS) {
      iina.console.log(...args);
    }
  }

  // src/adapters/iina/playbackRuntime.ts
  function initializePlaybackHandlers(options) {
    const logger = {
      debug: (...values) => logDebug(...values),
      error: (message) => iina.console.error(message)
    };
    const view = {
      hideSidebar: options.hideSidebar,
      showSidebar: options.showSidebar,
      refreshSidebar: options.refreshSidebar,
      showHttpsAlert: options.showHttpsAlert,
      showSkipButton,
      hideSkipButton,
      setSkipHandler: setSkipSegmentHandler
    };
    const controller = new PlaybackController({
      player: new IinaPlayer(logger),
      clock: new IinaClock,
      preferences: new IinaPlaybackPreferences(AUTOPLAY_NEXT_PREF_KEY, SKIP_SEGMENT_PREF_KEY),
      api: new IinaPlaybackApi,
      view,
      logger,
      config: {
        splashUrl: resolveJellyfinSplashUrl((path) => iina.file.exists(path)),
        ticksPerSecond: TICKS_PER_SECOND,
        resumeSeekDelayMs: RESUME_SEEK_DELAY_MS,
        progressReportIntervalMs: PROGRESS_REPORT_INTERVAL_MS,
        playbackTickIntervalMs: PLAYBACK_TICK_INTERVAL_MS,
        eofWatchThresholdSeconds: EOF_WATCH_THRESHOLD_SECONDS,
        skipSegmentPollIntervalMs: SKIP_SEGMENT_POLL_INTERVAL_MS
      }
    });
    iina.event.on("mpv.file-loaded", () => controller.onFileLoaded());
    iina.event.on("mpv.end-file", () => controller.onEndFile());
    iina.event.on("mpv.pause.changed", () => controller.onPauseChanged());
    iina.event.on("mpv.aid.changed", () => controller.onTrackChanged());
    iina.event.on("mpv.sid.changed", () => controller.onTrackChanged());
    iina.event.on("iina.window-will-close", () => controller.onWindowClose());
    return controller;
  }

  // src/sidebar/launch.ts
  function shouldOpenJellyfinSplash(state) {
    return !state.windowReady && (state.windowClosed || !state.windowLoaded && !state.mediaPath);
  }

  // src/adapters/iina/runtime.ts
  var { core, event: event2, menu, mpv, preferences, sidebar, utils } = iina;
  var SIDEBAR_VISIBILITY_POLL_MS = 200;
  logDebug("Jellyfin: Plugin loaded");
  var windowReady = false;
  var windowClosed = false;
  var pendingShowSidebar = false;
  var sidebarVisible = false;
  var backdropPreviewsEnabled = true;
  var sidebarVisibilityTimer = null;
  function getSidebarVisibility() {
    const sidebarWithVisibility = sidebar;
    const trackedOpen = typeof sidebarWithVisibility.isVisible === "function" ? sidebarWithVisibility.isVisible() : sidebarVisible;
    return isJellyfinSidebarOpen(core.window.sidebar, trackedOpen);
  }
  function showSidebarWithNotification() {
    sidebar.show();
    sidebarVisible = true;
    syncBackdropEligibility();
  }
  function showSidebarWithDelay() {
    setTimeout(() => {
      showSidebarWithNotification();
    }, SHOW_SIDEBAR_DELAY_MS);
  }
  function hideSidebar() {
    sidebar.hide();
    sidebarVisible = false;
    syncBackdropEligibility();
  }
  function showHttpsAlert() {
    utils.ask("Jellyfin requires an https:// server URL. HTTP is not supported.");
  }
  function getPreferEpisodeImagesInNextUp() {
    const value = preferences.get(PREFER_EPISODE_IMAGES_IN_NEXT_UP_PREF_KEY);
    return Boolean(value);
  }
  function getBackdropPreviewsEnabled() {
    const value = preferences.get(BACKDROP_PREVIEWS_PREF_KEY);
    if (value === undefined || value === null) {
      return true;
    }
    return Boolean(value);
  }
  function postSidebarPreferences() {
    sidebar.postMessage(MESSAGE_NAMES.SidebarPreferences, {
      backdropPreviewsEnabled,
      preferEpisodeImagesInNextUp: getPreferEpisodeImagesInNextUp()
    });
  }
  function syncBackdropEligibility() {
    if (!windowReady) {
      setBackdropEligibility(false);
      return;
    }
    setBackdropEligibility(shouldShowBackdrop({
      playbackPaused: isBackdropPlaybackPaused(mpv.getFlag("pause"), mpv.getString("path")),
      jellyfinSidebarOpen: getSidebarVisibility(),
      previewsEnabled: backdropPreviewsEnabled
    }));
  }
  function startSidebarVisibilityPolling() {
    if (sidebarVisibilityTimer) {
      return;
    }
    sidebarVisibilityTimer = setInterval(syncBackdropEligibility, SIDEBAR_VISIBILITY_POLL_MS);
  }
  function stopSidebarVisibilityPolling() {
    if (!sidebarVisibilityTimer) {
      return;
    }
    clearInterval(sidebarVisibilityTimer);
    sidebarVisibilityTimer = null;
  }
  function toggleSidebarFromHotkey() {
    if (!windowReady) {
      pendingShowSidebar = true;
      if (shouldOpenJellyfinSplash({
        windowReady,
        windowClosed,
        windowLoaded: core.window.loaded,
        mediaPath: mpv.getString("path")
      })) {
        core.open(resolveJellyfinSplashUrl((path) => iina.file.exists(path)));
      }
      return;
    }
    if (getSidebarVisibility()) {
      logDebug("Jellyfin: Sidebar already open, hiding it");
      hideSidebar();
      return;
    }
    showSidebarWithDelay();
  }
  menu.addItem(menu.item("Jellyfin", toggleSidebarFromHotkey, { keyBinding: "Shift+J" }));
  initializeMediaOverlay();
  event2.on("mpv.pause.changed", syncBackdropEligibility);
  event2.on("iina.window-will-close", () => {
    stopSidebarVisibilityPolling();
    windowReady = false;
    windowClosed = true;
    sidebarVisible = false;
    syncBackdropEligibility();
  });
  var playbackController = initializePlaybackHandlers({
    hideSidebar,
    showSidebar: showSidebarWithNotification,
    refreshSidebar: () => {
      sidebar.postMessage(MESSAGE_NAMES.RefreshSidebar, {});
    },
    showHttpsAlert
  });
  event2.on("iina.window-loaded", () => {
    logDebug("Jellyfin: Window loaded");
    windowClosed = false;
    backdropPreviewsEnabled = getBackdropPreviewsEnabled();
    loadMediaOverlay();
    sidebar.loadFile("ui/sidebar.html");
    sidebar.onMessage(MESSAGE_NAMES.PlayItem, (data) => {
      logDebug("Jellyfin: Received playItem");
      playbackController.play(data);
    });
    sidebar.onMessage(MESSAGE_NAMES.BackdropContext, (data) => {
      setBackdropContext(data);
    });
    sidebar.onMessage(MESSAGE_NAMES.SidebarVisibilityChanged, (data) => {
      sidebarVisible = Boolean(data?.visible);
      syncBackdropEligibility();
    });
    sidebar.onMessage(MESSAGE_NAMES.AuthUpdated, (data) => {
      if (!data || !data.serverUrl) {
        return;
      }
      const normalizedUrl = normalizeServerUrl(data.serverUrl);
      if (!isHttpsUrl(normalizedUrl)) {
        showHttpsAlert();
        return;
      }
      updateAuthState({
        ...data,
        serverUrl: normalizedUrl
      });
      refreshMediaOverlay();
      postSidebarPreferences();
    });
    sidebar.onMessage(MESSAGE_NAMES.AuthCleared, () => {
      clearBackdropContext();
      clearAuthState();
    });
    windowReady = true;
    startSidebarVisibilityPolling();
    syncBackdropEligibility();
    if (pendingShowSidebar) {
      logDebug("Jellyfin: Showing sidebar (pending request)");
      showSidebarWithDelay();
      pendingShowSidebar = false;
    }
    logDebug("Jellyfin: Ready");
  });
})();
