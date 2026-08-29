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

  // src/sidebar/router.ts
  function createRouterState() {
    return { stack: [{ kind: "home" }] };
  }
  function getCurrentRoute(router) {
    return router.stack[router.stack.length - 1] || { kind: "home" };
  }
  function getCurrentBrowseRoute(router) {
    for (let index = router.stack.length - 1;index >= 0; index -= 1) {
      const route = router.stack[index];
      if (route?.kind !== "search") {
        return route || { kind: "home" };
      }
    }
    return { kind: "home" };
  }
  function navigateHome() {
    return createRouterState();
  }
  function navigateLibrary(route) {
    return {
      stack: [
        { kind: "home" },
        { kind: "library", ...route }
      ]
    };
  }
  function navigateToDetails(router, route) {
    const stack = [...router.stack];
    if (getCurrentRoute(router).kind === "search") {
      stack.pop();
    }
    const current = stack[stack.length - 1];
    if (current?.kind === route.kind && current.id === route.id) {
      return { stack };
    }
    stack.push(route);
    return { stack };
  }
  function beginSearch(router, query, filter) {
    const current = getCurrentRoute(router);
    if (current?.kind === "search") {
      const stack = [...router.stack];
      stack[stack.length - 1] = { ...current, query, filter };
      return { stack };
    }
    const origin = current.kind === "library" ? router.stack : [{ kind: "home" }];
    return { stack: [...origin, { kind: "search", query, filter }] };
  }
  function updateSearch(router, update) {
    const stack = [...router.stack];
    const current = stack[stack.length - 1];
    if (current?.kind !== "search") {
      return router;
    }
    stack[stack.length - 1] = { ...current, ...update };
    return { stack };
  }
  function clearSearch(router) {
    if (getCurrentRoute(router).kind !== "search") {
      return router;
    }
    return { stack: router.stack.slice(0, -1) };
  }
  function navigateBack(router) {
    if (router.stack.length <= 1) {
      return router;
    }
    return { stack: router.stack.slice(0, -1) };
  }
  function getBreadcrumbs(router) {
    return router.stack.filter((route) => route.kind === "library" || route.kind === "movie" || route.kind === "series");
  }
  function getSearchOrigin(router) {
    if (getCurrentRoute(router).kind !== "search") {
      return null;
    }
    return getCurrentBrowseRoute(router).kind === "library" ? "library" : "home";
  }

  // src/sidebar/store.ts
  function createInitialSidebarState() {
    return {
      router: createRouterState(),
      retryOperation: null,
      breadcrumb: [],
      serverUrl: "",
      serverName: "",
      accessToken: "",
      userId: "",
      deviceId: "",
      username: "",
      backdropPreviewsEnabled: true,
      preferEpisodeImagesInNextUp: false,
      searchQuery: "",
      searchFilter: "all",
      searchOrigin: null,
      currentLibrary: null,
      currentSeries: null
    };
  }
  function toLegacyBreadcrumb(entry) {
    if (entry.kind === "library") {
      return {
        type: "library",
        id: entry.id,
        name: entry.name,
        collectionType: entry.collectionType
      };
    }
    return { type: entry.kind, id: entry.id, name: entry.name };
  }

  class SidebarStore {
    state;
    listeners = new Set;
    constructor(initialState = createInitialSidebarState()) {
      this.state = initialState;
    }
    subscribe(listener) {
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    }
    patch(update) {
      Object.assign(this.state, update);
      this.emit();
    }
    setRetryOperation(operation) {
      this.state.retryOperation = operation;
      this.emit();
    }
    navigateHome() {
      this.setRouter(navigateHome());
    }
    navigateLibrary(id, name, collectionType) {
      this.setRouter(navigateLibrary({ id, name, collectionType }));
    }
    navigateToDetails(route) {
      this.setRouter(navigateToDetails(this.state.router, route));
    }
    beginSearch(query, filter) {
      this.setRouter(beginSearch(this.state.router, query, filter));
    }
    updateSearch(query) {
      const current = getCurrentRoute(this.state.router);
      if (current.kind === "search") {
        this.setRouter(updateSearch(this.state.router, { query }));
        return;
      }
      this.state.searchQuery = query;
      this.emit();
    }
    setSearchFilter(filter) {
      const current = getCurrentRoute(this.state.router);
      this.setRouter(current.kind === "search" ? updateSearch(this.state.router, { filter }) : this.state.router);
      this.state.searchFilter = filter;
      this.emit();
    }
    clearSearch() {
      this.setRouter(clearSearch(this.state.router));
    }
    back() {
      this.setRouter(navigateBack(this.state.router));
      return getCurrentRoute(this.state.router);
    }
    setRouter(router) {
      this.state.router = router;
      this.state.breadcrumb = getBreadcrumbs(router).map(toLegacyBreadcrumb);
      const current = getCurrentRoute(router);
      this.state.searchQuery = current.kind === "search" ? current.query : "";
      this.state.searchFilter = current.kind === "search" ? current.filter : "all";
      this.state.searchOrigin = getSearchOrigin(router);
      this.emit();
    }
    emit() {
      this.listeners.forEach((listener) => listener(this.state));
    }
  }
  var sidebarStore = new SidebarStore;
  var state = sidebarStore.state;

  // src/adapters/browser/fetchTransport.ts
  function createFetchTransport(fetchImplementation = fetch) {
    return {
      async send(request) {
        const init = {
          method: request.method,
          headers: request.headers
        };
        if (request.body !== undefined) {
          init.body = JSON.stringify(request.body);
        }
        const response = await fetchImplementation(request.url, init);
        return {
          status: response.status,
          statusText: response.statusText,
          text: await response.text()
        };
      }
    };
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

  // src/jellyfin/url.ts
  function isHttpsUrl(url) {
    return url.trim().toLowerCase().startsWith("https://");
  }
  function normalizeServerUrl(url) {
    return url.trim().replace(/\/+$/, "");
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

  // src/jellyfin/fields.ts
  var FIELDS_LIBRARY_ITEMS = "Overview,Genres,MediaSources,UserData,RunTimeTicks,SeriesId,SeasonId";
  var FIELDS_EPISODES = "Overview,MediaSources,UserData,RunTimeTicks,SeriesName,ParentIndexNumber,IndexNumber,SeriesId,SeasonId";
  var FIELDS_HOME_ITEMS = "Overview,UserData,RunTimeTicks,SeriesName,ProductionYear,ParentIndexNumber,IndexNumber,SeriesId,SeasonId";
  var FIELDS_SEARCH = "Overview,UserData,RunTimeTicks,SeriesName,ProductionYear,ParentIndexNumber,IndexNumber,SeriesId,SeasonId,RecursiveItemCount,ChildCount";
  var FIELDS_SEASONS = "Overview,UserData,RunTimeTicks,IndexNumber";
  var ITEM_DETAILS_FIELDS = "Overview,Taglines,Genres,MediaSources,UserData,RunTimeTicks,OfficialRating,ProductionYear,PremiereDate,EndDate,Status,RecursiveItemCount,ChildCount,ParentIndexNumber,IndexNumber,SeriesName,SeriesId,SeasonId,ParentId,Type,Name";

  // src/jellyfin/apiError.ts
  class JellyfinApiError extends Error {
    status;
    endpoint;
    constructor(status, endpoint) {
      super(`Jellyfin request failed (${status}) for ${endpoint}.`);
      this.status = status;
      this.endpoint = endpoint;
      this.name = "JellyfinApiError";
    }
  }
  function isConfirmedAuthenticationFailure(error) {
    return error instanceof JellyfinApiError && error.status === 401;
  }

  // src/jellyfin/endpoints.ts
  function buildLibraryItemsEndpoint(userId, libraryId, collectionType, startIndex = 0, limit = 60) {
    const itemType = collectionType === "movies" ? "Movie" : "Series";
    let endpoint = `/Items?userId=${encodeURIComponent(userId)}`;
    endpoint += libraryId ? `&parentId=${encodeURIComponent(libraryId)}` : "&recursive=true";
    endpoint += "&sortBy=SortName&sortOrder=Ascending";
    endpoint += `&fields=${FIELDS_LIBRARY_ITEMS}`;
    endpoint += "&enableImageTypes=Primary,Backdrop,Thumb";
    endpoint += `&includeItemTypes=${itemType}`;
    endpoint += `&startIndex=${startIndex}&limit=${limit}`;
    return endpoint;
  }
  function buildEpisodesEndpoint(userId, seriesId, seasonId) {
    return `/Shows/${encodeURIComponent(seriesId)}/Episodes?userId=${encodeURIComponent(userId)}` + `&seasonId=${encodeURIComponent(seasonId)}&fields=${FIELDS_EPISODES}`;
  }
  function buildLatestItemsEndpoint(userId, itemType, limit) {
    return `/Items/Latest?userId=${encodeURIComponent(userId)}` + `&includeItemTypes=${encodeURIComponent(itemType)}&limit=${limit}` + `&fields=${FIELDS_HOME_ITEMS}&groupItems=false`;
  }
  function buildItemsByIdsEndpoint(userId, itemIds, itemType) {
    const ids = itemIds.map((itemId) => encodeURIComponent(itemId)).join(",");
    return `/Items?userId=${encodeURIComponent(userId)}&ids=${ids}` + `&includeItemTypes=${encodeURIComponent(itemType)}` + `&fields=${FIELDS_HOME_ITEMS}&enableImageTypes=Primary,Backdrop,Thumb`;
  }
  function buildNewestSeasonsEndpoint(userId, startIndex, limit) {
    return `/Items?userId=${encodeURIComponent(userId)}&recursive=true&includeItemTypes=Season` + `&sortBy=DateCreated&sortOrder=Descending&startIndex=${startIndex}&limit=${limit}` + "&fields=SeriesId,ParentId";
  }
  function buildResumeItemsEndpoint(userId) {
    return `/UserItems/Resume?userId=${encodeURIComponent(userId)}&limit=10&mediaTypes=Video` + `&fields=${FIELDS_HOME_ITEMS}`;
  }
  function buildNextUpItemsEndpoint(userId) {
    return `/Shows/NextUp?userId=${encodeURIComponent(userId)}&limit=10&fields=${FIELDS_HOME_ITEMS}`;
  }
  function buildSearchEndpoint(userId, query) {
    return `/Items?searchTerm=${encodeURIComponent(query)}` + `&userId=${encodeURIComponent(userId)}` + "&includeItemTypes=Movie,Series,Episode" + `&fields=${FIELDS_SEARCH}` + "&recursive=true&limit=20";
  }
  function buildSeasonsEndpoint(userId, seriesId) {
    return `/Shows/${encodeURIComponent(seriesId)}/Seasons?userId=${encodeURIComponent(userId)}` + `&fields=${FIELDS_SEASONS}`;
  }
  function buildSeriesNextUpEndpoint(userId, seriesId) {
    return `/Shows/NextUp?userId=${encodeURIComponent(userId)}` + `&seriesId=${encodeURIComponent(seriesId)}&limit=1&fields=${FIELDS_HOME_ITEMS}`;
  }
  function buildItemDetailsEndpoint(userId, itemId, fields) {
    return `/Items/${encodeURIComponent(itemId)}?userId=${encodeURIComponent(userId)}` + `&fields=${fields}`;
  }

  // src/adapters/browser/storage.ts
  var DEVICE_ID_KEY = "jellyfin-device-id";
  var SESSION_KEY = "jellyfin-session";
  function isRecord(value) {
    return typeof value === "object" && value !== null;
  }
  function parseStoredSession(value) {
    if (!isRecord(value)) {
      return null;
    }
    if (typeof value.serverUrl !== "string" || !value.serverUrl) {
      return null;
    }
    if (typeof value.serverName !== "string") {
      return null;
    }
    if (typeof value.accessToken !== "string" || !value.accessToken) {
      return null;
    }
    if (typeof value.userId !== "string" || !value.userId) {
      return null;
    }
    if (typeof value.username !== "string") {
      return null;
    }
    return {
      serverUrl: value.serverUrl,
      serverName: value.serverName,
      accessToken: value.accessToken,
      userId: value.userId,
      username: value.username
    };
  }
  var cachedDeviceId = "";
  function getDeviceId() {
    if (cachedDeviceId) {
      return cachedDeviceId;
    }
    let deviceId = localStorage.getItem(DEVICE_ID_KEY);
    if (!deviceId) {
      const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
      deviceId = "iina-jellyfin-";
      for (let i = 0;i < 16; i += 1) {
        deviceId += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      localStorage.setItem(DEVICE_ID_KEY, deviceId);
    }
    cachedDeviceId = deviceId;
    return deviceId;
  }
  function saveSessionToStorage(session) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }
  function loadSessionFromStorage() {
    try {
      const stored = localStorage.getItem(SESSION_KEY);
      if (!stored) {
        return null;
      }
      const sessionData = parseStoredSession(JSON.parse(stored));
      if (sessionData) {
        return sessionData;
      }
      clearSessionFromStorage();
    } catch (error) {
      clearSessionFromStorage();
      console.error("Failed to load session from localStorage:", error);
    }
    return null;
  }
  function clearSessionFromStorage() {
    localStorage.removeItem(SESSION_KEY);
  }

  // src/adapters/browser/sidebarApi.ts
  var authenticationFailureHandler = null;
  var client = new JellyfinClient(createFetchTransport(), {
    clientName: CLIENT_NAME,
    deviceName: DEVICE_NAME,
    version: CLIENT_VERSION
  });
  function setAuthenticationFailureHandler(handler) {
    authenticationFailureHandler = handler;
  }
  async function authenticateUser(serverUrl, username, password) {
    const endpoint = "/Users/AuthenticateByName";
    try {
      const result = await client.requestJson({
        serverUrl,
        accessToken: "",
        deviceId: getDeviceId()
      }, {
        method: "POST",
        endpoint,
        body: {
          Username: username,
          Pw: password
        }
      });
      if (!result) {
        throw new Error("Missing authentication response.");
      }
      return result;
    } catch (error) {
      if (error instanceof JellyfinHttpError && error.status === 401) {
        throw new Error("Authentication failed. Check your credentials.");
      }
      throw mapClientError(error, endpoint);
    }
  }
  async function apiRequest(method, endpoint, data) {
    const options = { method, endpoint };
    if (data !== undefined && (method === "POST" || method === "PUT" || method === "PATCH")) {
      options.body = data;
    }
    try {
      return await client.requestJson({
        serverUrl: state.serverUrl,
        accessToken: state.accessToken,
        deviceId: getDeviceId()
      }, options);
    } catch (error) {
      const mappedError = mapClientError(error, endpoint);
      if (mappedError instanceof JellyfinApiError && mappedError.status === 401 && state.accessToken && authenticationFailureHandler) {
        authenticationFailureHandler();
      }
      throw mappedError;
    }
  }
  function mapClientError(error, endpoint) {
    if (error instanceof JellyfinHttpError) {
      return new JellyfinApiError(error.status, endpoint);
    }
    if (error instanceof JellyfinJsonError) {
      return new Error(`Expected JSON response for ${endpoint} but got: ${error.snippet}`.trim());
    }
    return error;
  }
  async function fetchServerName() {
    try {
      const systemInfo = await apiRequest("GET", "/System/Info/Public");
      return systemInfo?.ServerName || "";
    } catch (error) {
      if (isConfirmedAuthenticationFailure(error)) {
        throw error;
      }
      console.error("Failed to fetch server name:", error);
      return "";
    }
  }
  async function fetchItemDetails(itemId) {
    const endpoint = buildItemDetailsEndpoint(state.userId, itemId, ITEM_DETAILS_FIELDS);
    return await apiRequest("GET", endpoint);
  }
  async function fetchPlaybackInfo(itemId) {
    return await apiRequest("POST", `/Items/${encodeURIComponent(itemId)}/PlaybackInfo`, buildPlaybackInfoRequest(state.userId, IINA_DEVICE_PROFILE));
  }

  // src/sidebar/dom.ts
  function getElement(id) {
    const element = document.getElementById(id);
    if (!element) {
      throw new Error(`Missing element: ${id}`);
    }
    return element;
  }
  var ui = {
    loginView: getElement("login-view"),
    browseView: getElement("browse-view"),
    loginForm: getElement("login-form"),
    loginError: getElement("login-error"),
    connectBtn: getElement("connect-btn"),
    backBtn: getElement("back-btn"),
    navigationLayer: getElement("navigation-layer"),
    sectionHeader: getElement("section-header"),
    sectionTitle: getElement("section-title"),
    content: getElement("content"),
    loading: getElement("loading"),
    errorState: getElement("error-state"),
    errorMessage: getElement("error-message"),
    bottomSearchLayer: getElement("bottom-search-layer"),
    searchFilters: getElement("search-filters"),
    searchInput: getElement("search-input"),
    clearSearchButton: getElement("clear-search"),
    retryBtn: getElement("retry-btn"),
    serverUrlInput: getElement("server-url"),
    usernameInput: getElement("username"),
    passwordInput: getElement("password")
  };

  // src/sidebar/backdropContext.ts
  var HOVER_DELAY_MS = 200;
  var HOVER_LINGER_MS = 1250;
  var playlistItemIds = [];
  var overrideItemId = "";
  var overridesAllowed = false;
  var hoveredCard = null;
  var focusedCard = null;
  var overrideTimer = null;
  function buildBackdropItemIds(items, random = Math.random) {
    const uniqueIds = Array.from(new Set(items.map(resolveBackdropItemId).filter(Boolean)));
    for (let index = uniqueIds.length - 1;index > 0; index -= 1) {
      const swapIndex = Math.floor(random() * (index + 1));
      [uniqueIds[index], uniqueIds[swapIndex]] = [uniqueIds[swapIndex], uniqueIds[index]];
    }
    return uniqueIds;
  }
  function setBackdropSlideshow(items) {
    resetInteractionState();
    playlistItemIds = buildBackdropItemIds(items);
    overridesAllowed = true;
    publishBackdropContext();
  }
  function setBackdropDetail(item) {
    resetInteractionState();
    const itemId = resolveBackdropItemId(item);
    playlistItemIds = itemId ? [itemId] : [];
    overridesAllowed = false;
    publishBackdropContext();
  }
  function setHoveredBackdropCard(card) {
    hoveredCard = card;
    updateBackdropOverride();
  }
  function setFocusedBackdropCard(card) {
    focusedCard = card;
    updateBackdropOverride();
  }
  function clearBackdropContext() {
    resetInteractionState();
    playlistItemIds = [];
    overridesAllowed = false;
    publishBackdropContext();
  }
  function resolveBackdropItemId(item) {
    if (item.Type === "Episode" || item.Type === "Season") {
      return item.SeriesId || item.Id || "";
    }
    return item.Id || "";
  }
  function resolveCardBackdropItemId(card) {
    const type = card.dataset.type || "";
    if (type === "Episode" || type === "Season") {
      return card.dataset.seriesId || card.dataset.id || "";
    }
    return card.dataset.id || "";
  }
  function updateBackdropOverride() {
    clearOverrideTimer();
    const targetCard = overridesAllowed ? hoveredCard || focusedCard : null;
    const nextItemId = targetCard ? resolveCardBackdropItemId(targetCard) : "";
    if (!state.backdropPreviewsEnabled) {
      clearBackdropOverride();
      return;
    }
    if (!nextItemId) {
      scheduleBackdropOverrideClear();
      return;
    }
    if (overrideItemId === nextItemId) {
      return;
    }
    overrideTimer = setTimeout(() => {
      overrideTimer = null;
      const currentTarget = hoveredCard || focusedCard;
      if (!overridesAllowed || currentTarget !== targetCard) {
        return;
      }
      overrideItemId = nextItemId;
      publishBackdropContext();
    }, HOVER_DELAY_MS);
  }
  function scheduleBackdropOverrideClear() {
    if (!overrideItemId) {
      return;
    }
    overrideTimer = setTimeout(() => {
      overrideTimer = null;
      if (overridesAllowed && (hoveredCard || focusedCard)) {
        return;
      }
      clearBackdropOverride();
    }, HOVER_LINGER_MS);
  }
  function clearBackdropOverride() {
    if (!overrideItemId) {
      return;
    }
    overrideItemId = "";
    publishBackdropContext();
  }
  function resetInteractionState() {
    clearOverrideTimer();
    hoveredCard = null;
    focusedCard = null;
    overrideItemId = "";
  }
  function clearOverrideTimer() {
    if (!overrideTimer) {
      return;
    }
    clearTimeout(overrideTimer);
    overrideTimer = null;
  }
  function publishBackdropContext() {
    iina.postMessage(MESSAGE_NAMES.BackdropContext, {
      itemIds: playlistItemIds,
      overrideItemId
    });
  }

  // src/sidebar/viewFormatting.ts
  function formatRuntime(ticks) {
    if (!ticks) {
      return "";
    }
    const totalMinutes = Math.floor(ticks / TICKS_PER_MINUTE);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  }
  function formatPaddedEpisodeNumber(season, episode) {
    const seasonNumber = String(season ?? 0).padStart(2, "0");
    const episodeNumber = String(episode ?? 0).padStart(2, "0");
    return `S${seasonNumber} E${episodeNumber}`;
  }

  // src/sidebar/viewModels.ts
  function buildMediaCardViewModel(item, options = {}) {
    const titleAndMetadata = getCardCopy(item, options);
    const episodeNumber = options.episodeRow ? getEpisodeRowNumber(item) : "";
    const episodeRuntime = options.episodeRow ? formatRuntime(item.RunTimeTicks) : "";
    const remainingLabel = getRemainingLabel(item);
    const accessibleTitle = episodeNumber ? `${episodeNumber} ${titleAndMetadata.title}` : titleAndMetadata.title;
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
  function buildMediaDetailsViewModel(item, seasonCount = 0) {
    return {
      metadata: getMediaDetailMetadata(item, seasonCount),
      tagline: item.Taglines?.find((value) => Boolean(value?.trim()))?.trim() || "",
      overview: String(item.Overview || ""),
      watched: item.Type === "Movie" && Boolean(item.UserData?.Played)
    };
  }
  function buildSearchResultsViewModel(items, filter) {
    const filterType = filter === "all" ? "" : filter.charAt(0).toUpperCase() + filter.slice(1);
    const visibleItems = filterType ? items.filter((item) => item.Type === filterType) : [...items];
    return {
      visibleItems,
      posterItems: visibleItems.filter((item) => item.Type === "Movie" || item.Type === "Series"),
      remainingItems: visibleItems.filter((item) => item.Type !== "Movie" && item.Type !== "Series"),
      emptyMessage: filter === "all" ? "No Results" : `No ${getFilterLabel(filter)} Found`
    };
  }
  function buildCardContext(item, directPlay = false) {
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
  function getSeriesPlayLabel(item) {
    const episodeNumber = formatPaddedEpisodeNumber(item.ParentIndexNumber, item.IndexNumber);
    const action = item.UserData?.PlaybackPositionTicks ? "Resume" : "Play";
    return `${action} ${episodeNumber}`;
  }
  function getProgressPercent(item) {
    if (!hasProgress(item)) {
      return null;
    }
    const runtime = item.RunTimeTicks || 0;
    const position = item.UserData?.PlaybackPositionTicks || 0;
    const percent = runtime ? Math.min(position / runtime * 100, 100) : 0;
    return percent >= 1 ? percent : null;
  }
  function opensDetails(item, options) {
    return !options.directPlay && (item.Type === "Movie" || item.Type === "Series");
  }
  function getEpisodeRowNumber(item) {
    if (item.IndexNumber === undefined || item.IndexNumber === null) {
      return "";
    }
    return `E${String(item.IndexNumber).padStart(2, "0")}`;
  }
  function getMediaDetailMetadata(item, seasonCount) {
    const metadata = [];
    if (item.ProductionYear) {
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
  function getYearLabel(item) {
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
  function getCardCopy(item, options) {
    return item.Type === "Episode" ? getEpisodeCardCopy(item, options) : getMediaCardCopy(item, options);
  }
  function getEpisodeCardCopy(item, options) {
    const itemName = String(item.Name || "Untitled");
    if (options.homeThumbnail) {
      return getHomeEpisodeCardCopy(item, itemName, options.showEpisodeNumber === true);
    }
    const metadata = [];
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
  function getHomeEpisodeCardCopy(item, itemName, showEpisodeNumber) {
    const metadata = item.SeriesName ? [String(item.SeriesName)] : [];
    if (showEpisodeNumber) {
      metadata.push(formatPaddedEpisodeNumber(item.ParentIndexNumber, item.IndexNumber));
    }
    return { title: itemName, metadata: metadata.join(" · ") };
  }
  function getMediaCardCopy(item, options) {
    const metadata = [];
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
  function getSeriesEpisodeCount(item) {
    const total = item.RecursiveItemCount || item.ChildCount || 0;
    if (!total) {
      return "";
    }
    const userData = item.UserData;
    const played = userData?.PlayedItemCount ?? Math.max(total - (userData?.UnplayedItemCount || 0), 0);
    return `${played} of ${total} watched`;
  }
  function hasProgress(item) {
    return Boolean(item.UserData?.PlaybackPositionTicks && item.RunTimeTicks && !item.UserData.Played);
  }
  function getRemainingLabel(item) {
    if (!hasProgress(item)) {
      return "";
    }
    const remainingTicks = Math.max((item.RunTimeTicks || 0) - (item.UserData?.PlaybackPositionTicks || 0), 0);
    const minutes = Math.max(Math.ceil(remainingTicks / TICKS_PER_MINUTE), 1);
    return `${minutes} min left`;
  }
  function getFilterLabel(filter) {
    if (filter === "movie") {
      return "Movies";
    }
    if (filter === "series") {
      return "Series";
    }
    return "Episodes";
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

  // src/sidebar/artwork.ts
  function selectCardArtwork(item, options) {
    if (options.usePosterImage) {
      return source(getEpisodeSeriesId(item), "Primary", 420);
    }
    if (options.useEpisodeThumbnail && item.Type === "Episode" && item.Id) {
      return source(item.Id, "Primary");
    }
    return source(getEpisodeSeriesId(item), "Thumb");
  }
  function selectCardFallbackArtwork(item, options) {
    if (options.usePosterImage) {
      return item.Type === "Episode" && item.Id ? source(item.Id, "Primary", 420) : source(item.Id || "", "Backdrop");
    }
    if (hasEpisodeThumbnailFallback(item, options)) {
      return source(item.SeriesId || "", "Thumb");
    }
    if (options.useSeriesBackdropFallback && item.Type === "Episode" && item.SeriesId) {
      return source(item.SeriesId, "Backdrop");
    }
    if (item.Type === "Movie" || item.Type === "Series") {
      return source(item.Id || "", "Backdrop");
    }
    return null;
  }
  function getDetailPlaybackLabel(item, playbackItem, preferredLabel) {
    if (!playbackItem) {
      return "";
    }
    if (preferredLabel) {
      return `${preferredLabel}, ${String(item.Name || "series")}`;
    }
    const hasResumePosition = playbackItem.UserData?.PlaybackPositionTicks && !playbackItem.UserData.Played;
    const action = hasResumePosition ? "Resume" : "Play";
    return `${action} ${String(item.Name || "movie")}`;
  }
  function getEpisodeSeriesId(item) {
    return item.Type === "Episode" && item.SeriesId ? item.SeriesId : item.Id || "";
  }
  function hasEpisodeThumbnailFallback(item, options) {
    return Boolean(options.useEpisodeThumbnail && item.Type === "Episode" && item.SeriesId && !options.disableEpisodeThumbnailFallback);
  }
  function source(itemId, imageType, maxWidth = 680) {
    return { itemId, imageType, maxWidth };
  }

  // src/sidebar/views/cards.ts
  function buildMediaList(items, options) {
    const list = document.createElement("div");
    list.className = "media-list";
    items.forEach((item) => list.appendChild(buildListCardElement(item, options)));
    return list;
  }
  function buildListCardElement(item, options) {
    const viewModel = buildMediaCardViewModel(item, options);
    const card = document.createElement("div");
    card.className = "list-card";
    card.classList.toggle("home-poster-card", Boolean(options.homePoster));
    card.classList.toggle("home-thumbnail-card", Boolean(options.homeThumbnail));
    card.classList.toggle("library-poster-card", Boolean(options.libraryPoster));
    card.classList.toggle("series-episode-card", Boolean(options.episodeRow));
    applyCardContext(card, viewModel.context);
    const thumbWrapper = document.createElement("div");
    thumbWrapper.className = "thumb-wrapper";
    thumbWrapper.appendChild(buildCardImage(item, options));
    if (viewModel.showPlayOverlay) {
      thumbWrapper.appendChild(buildPlayOverlay());
    }
    if (viewModel.remainingLabel && !viewModel.artworkOnly) {
      const label = document.createElement("div");
      label.className = "resume-label";
      label.textContent = viewModel.remainingLabel;
      thumbWrapper.appendChild(label);
    }
    const progress = buildThumbProgressElement(viewModel.progressPercent);
    if (progress) {
      thumbWrapper.appendChild(progress);
    }
    if (viewModel.played) {
      thumbWrapper.appendChild(buildWatchedIndicator());
    }
    card.setAttribute("aria-label", viewModel.accessibleName);
    card.title = viewModel.accessibleName;
    card.appendChild(thumbWrapper);
    if (!viewModel.artworkOnly) {
      card.appendChild(buildCardBody(viewModel, options));
    }
    return card;
  }
  function findListCard(target) {
    if (!target || !target.closest) {
      return null;
    }
    return target.closest(".list-card");
  }
  function getCardContext(card) {
    if (!card) {
      return null;
    }
    const resume = Number.parseInt(card.dataset.resume || "0", 10) || 0;
    return {
      id: card.dataset.id || "",
      name: card.dataset.name || "",
      type: card.dataset.type || "",
      resume,
      directPlay: card.dataset.directPlay === "true",
      context: {
        seriesId: card.dataset.seriesId || "",
        seasonId: card.dataset.seasonId || "",
        episodeIndex: card.dataset.episodeIndex ? Number.parseInt(card.dataset.episodeIndex, 10) : null
      }
    };
  }
  function handleContentError(event) {
    const imageElement = event.target;
    if (!imageElement || imageElement.tagName !== "IMG") {
      return;
    }
    if (imageElement.classList.contains("list-thumb") || imageElement.classList.contains("media-detail-image")) {
      handleImageFallback(imageElement);
    }
  }
  function buildThumbProgressElement(percent) {
    if (percent === null) {
      return null;
    }
    const roundedPercent = Math.round(percent);
    const progress = document.createElement("div");
    progress.className = "thumb-progress";
    progress.setAttribute("role", "progressbar");
    progress.setAttribute("aria-valuenow", String(roundedPercent));
    progress.setAttribute("aria-valuemin", "0");
    progress.setAttribute("aria-valuemax", "100");
    progress.setAttribute("aria-valuetext", `${roundedPercent}% watched`);
    const fill = document.createElement("div");
    fill.className = "thumb-progress-fill";
    fill.style.width = `${percent}%`;
    progress.appendChild(fill);
    return progress;
  }
  function buildWatchedIndicator() {
    const indicator = document.createElement("div");
    indicator.className = "watched-indicator";
    indicator.setAttribute("title", "Watched");
    indicator.innerHTML = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="m3 7.2 2.5 2.5L11.2 4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    return indicator;
  }
  function getImageUrl(itemId, imageType = "Primary", maxWidth = 680) {
    return buildJellyfinImageUrl({
      serverUrl: state.serverUrl,
      accessToken: state.accessToken,
      itemId,
      imageType,
      maxWidth
    });
  }
  function getNextUpImageOptions() {
    return state.preferEpisodeImagesInNextUp ? { useEpisodeThumbnail: true, disableEpisodeThumbnailFallback: true } : { useEpisodeThumbnail: false, useSeriesBackdropFallback: true };
  }
  function getLibraryPosterOptions() {
    return {
      libraryPoster: true,
      usePosterImage: true,
      showSeriesName: false
    };
  }
  function getSearchCardOptions(item) {
    if (item.Type === "Episode") {
      return { showSeriesName: true, showEpisodeNumber: true, useEpisodeThumbnail: true };
    }
    if (item.Type === "Movie" || item.Type === "Series") {
      return getLibraryPosterOptions();
    }
    return { showSeriesName: false };
  }
  function buildCardImage(item, options) {
    const image = document.createElement("img");
    image.className = "list-thumb";
    image.src = getArtworkUrl(selectCardArtwork(item, options));
    image.dataset.fallback = getArtworkUrl(selectCardFallbackArtwork(item, options));
    image.dataset.itemId = item.Id || "";
    image.dataset.type = item.Type || "";
    image.alt = "";
    image.loading = "lazy";
    return image;
  }
  function buildCardBody(viewModel, options) {
    const body = document.createElement("div");
    body.className = "list-body";
    const title = document.createElement("div");
    title.className = "list-title";
    title.textContent = viewModel.title;
    if (options.episodeRow) {
      const heading = document.createElement("div");
      heading.className = "series-episode-heading";
      if (viewModel.episodeNumber) {
        const number = document.createElement("span");
        number.className = "series-episode-number";
        number.textContent = viewModel.episodeNumber;
        heading.appendChild(number);
      }
      heading.appendChild(title);
      if (viewModel.episodeRuntime) {
        const duration = document.createElement("span");
        duration.className = "series-episode-duration";
        duration.textContent = viewModel.episodeRuntime;
        heading.appendChild(duration);
      }
      body.appendChild(heading);
    } else {
      body.appendChild(title);
    }
    if (viewModel.metadata && !options.episodeRow) {
      const metadata = document.createElement("div");
      metadata.className = "list-meta";
      metadata.textContent = viewModel.metadata;
      body.appendChild(metadata);
    }
    if (options.episodeRow && viewModel.overview) {
      const overview = document.createElement("div");
      overview.className = "list-overview";
      overview.textContent = viewModel.overview;
      body.appendChild(overview);
    }
    return body;
  }
  function applyCardContext(card, context) {
    card.dataset.id = context.id;
    card.dataset.name = context.name;
    card.dataset.type = context.type;
    card.dataset.resume = String(context.resume);
    card.dataset.seriesId = context.context.seriesId;
    card.dataset.seasonId = context.context.seasonId;
    card.dataset.episodeIndex = context.context.episodeIndex === null ? "" : String(context.context.episodeIndex);
    card.dataset.directPlay = String(context.directPlay);
    card.setAttribute("data-clickable", "");
    card.tabIndex = 0;
    card.setAttribute("role", "button");
  }
  function buildPlayOverlay() {
    const overlay = document.createElement("div");
    overlay.className = "play-overlay";
    const button = document.createElement("span");
    button.className = "play-button";
    button.setAttribute("aria-hidden", "true");
    button.innerHTML = '<svg width="19" height="19" viewBox="0 0 19 19"><path d="M6.7 4.2c0-.7.8-1.1 1.4-.7l7 4.6c.5.3.5 1.1 0 1.4l-7 4.6c-.6.4-1.4 0-1.4-.7V4.2Z" fill="currentColor"/></svg>';
    overlay.appendChild(button);
    return overlay;
  }
  function getArtworkUrl(artwork) {
    return artwork ? getImageUrl(artwork.itemId, artwork.imageType, artwork.maxWidth) : "";
  }
  function handleImageFallback(image) {
    const fallbackUrl = image.dataset.fallback || "";
    if (fallbackUrl && image.dataset.fallbackApplied !== "true") {
      image.dataset.fallbackApplied = "true";
      image.src = fallbackUrl;
      return;
    }
    const itemId = image.dataset.itemId || "";
    const type = image.dataset.type || "";
    if (image.dataset.backdropApplied !== "true" && itemId && (type === "Movie" || type === "Series")) {
      image.dataset.backdropApplied = "true";
      image.src = getImageUrl(itemId, "Backdrop");
      return;
    }
    image.style.display = "none";
  }
  // src/sidebar/views/content.ts
  var libraryGridObserver = null;
  var libraryGridLoadMore = null;
  function replaceContent(...nodes) {
    resetLibraryGrid();
    ui.content.classList.remove("library-content");
    ui.content.replaceChildren(...nodes);
  }
  function resetLibraryGrid() {
    disconnectLibraryGridObserver();
    libraryGridLoadMore = null;
  }
  function setLibraryGridLoadMore(onLoadMore) {
    libraryGridLoadMore = onLoadMore;
  }
  function updateLibraryLoadStatus(hasMore) {
    disconnectLibraryGridObserver();
    ui.content.querySelector("[data-library-load-status]")?.remove();
    if (!hasMore || !libraryGridLoadMore) {
      return;
    }
    const status = getOrCreateLibraryLoadStatus();
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (status.isConnected && libraryGridLoadMore) {
        observeLibraryLoadStatus(status);
      }
    }));
  }
  function getOrCreateLibraryLoadStatus() {
    const existing = ui.content.querySelector("[data-library-load-status]");
    if (existing) {
      return existing;
    }
    const status = document.createElement("div");
    status.className = "library-load-status";
    status.dataset.libraryLoadStatus = "";
    status.setAttribute("role", "status");
    status.setAttribute("aria-label", "Loading more titles");
    status.appendChild(buildLibraryLoadingSpinner());
    ui.content.appendChild(status);
    return status;
  }
  function buildLibraryLoadingSpinner() {
    const spinner = document.createElement("span");
    spinner.className = "library-loading-spinner";
    spinner.setAttribute("aria-hidden", "true");
    return spinner;
  }
  function disconnectLibraryGridObserver() {
    libraryGridObserver?.disconnect();
    libraryGridObserver = null;
  }
  function observeLibraryLoadStatus(status) {
    if (!libraryGridLoadMore) {
      return;
    }
    libraryGridObserver = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        libraryGridLoadMore?.();
      }
    }, { rootMargin: "360px 0px" });
    libraryGridObserver.observe(status);
  }

  // src/sidebar/views/feedback.ts
  function buildFeedbackState(titleText, detailText) {
    const feedback = document.createElement("div");
    feedback.className = "feedback-state feedback-state--inline";
    const icon = document.createElement("div");
    icon.className = "feedback-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.innerHTML = '<svg width="34" height="34" viewBox="0 0 34 34" fill="none"><circle cx="14" cy="14" r="8.5" stroke="currentColor" stroke-width="1.5"/><path d="m20.5 20.5 6 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
    const title = document.createElement("h3");
    title.textContent = titleText;
    feedback.append(icon, title);
    if (detailText) {
      const detail = document.createElement("p");
      detail.textContent = detailText;
      feedback.appendChild(detail);
    }
    return feedback;
  }
  function getEmptyStateDetail(message) {
    return message.toLowerCase().includes("result") ? "Try a different title or change the filter." : "";
  }

  // src/sidebar/views/chrome.ts
  function showLoginView() {
    clearBackdropContext();
    ui.loginView.classList.remove("hidden");
    ui.browseView.classList.add("hidden");
  }
  function showBrowseView() {
    ui.loginView.classList.add("hidden");
    ui.browseView.classList.remove("hidden");
  }
  function showLoading(layout) {
    disconnectLibraryGridObserver();
    ui.loading.dataset.layout = layout;
    ui.loading.classList.remove("hidden");
    ui.content.classList.add("hidden");
    ui.errorState.classList.add("hidden");
  }
  function hideLoading() {
    ui.loading.classList.add("hidden");
    ui.errorState.classList.add("hidden");
    ui.content.classList.remove("hidden");
  }
  function renderEmptyState(message) {
    replaceContent(buildFeedbackState(message, getEmptyStateDetail(message)));
  }
  function showError(message) {
    ui.loading.classList.add("hidden");
    ui.content.classList.add("hidden");
    ui.errorState.classList.remove("hidden");
    ui.errorMessage.textContent = message;
  }
  function updateTitle(title) {
    ui.sectionTitle.textContent = title;
    ui.backBtn.setAttribute("aria-label", `Back from ${title}`);
    ui.backBtn.title = `Back from ${title}`;
    const showHome = title === "Home" && state.breadcrumb.length === 0 && !state.searchQuery;
    const showSearchFilters = title === "Search Results" && Boolean(state.searchQuery);
    const showSectionHeader = !showHome && !showSearchFilters;
    const canGoBack = state.breadcrumb.length > 0;
    ui.searchFilters.classList.toggle("hidden", !showSearchFilters);
    ui.navigationLayer.classList.toggle("hidden", !showSectionHeader);
    ui.sectionHeader.classList.toggle("hidden", !showSectionHeader);
    ui.backBtn.classList.toggle("hidden", !canGoBack);
    ui.browseView.classList.toggle("home-view", showHome);
    ui.browseView.classList.toggle("searching", showSearchFilters);
  }
  // src/sidebar/views/collection.ts
  function renderLibraryGrid(items, hasMore, onLoadMore) {
    const grid = document.createElement("div");
    grid.className = "library-poster-grid";
    grid.dataset.libraryGrid = "";
    items.forEach((item) => grid.appendChild(buildListCardElement(item, getLibraryPosterOptions())));
    replaceContent(grid);
    setBackdropSlideshow(items);
    setLibraryGridLoadMore(onLoadMore);
    ui.content.classList.add("library-content");
    updateLibraryLoadStatus(hasMore);
  }
  function appendLibraryGridItems(items, hasMore) {
    const grid = ui.content.querySelector("[data-library-grid]");
    if (!grid) {
      return;
    }
    const fragment = document.createDocumentFragment();
    items.forEach((item) => fragment.appendChild(buildListCardElement(item, getLibraryPosterOptions())));
    grid.appendChild(fragment);
    updateLibraryLoadStatus(hasMore);
  }
  function showLibraryGridLoadError(onRetry) {
    disconnectLibraryGridObserver();
    const status = getOrCreateLibraryLoadStatus();
    status.classList.add("library-load-status--error");
    status.removeAttribute("role");
    status.removeAttribute("aria-label");
    const retry = document.createElement("button");
    retry.className = "btn-secondary library-load-retry";
    retry.type = "button";
    retry.textContent = "Try Again";
    retry.addEventListener("click", () => {
      status.replaceChildren(buildLibraryLoadingSpinner());
      status.classList.remove("library-load-status--error");
      status.setAttribute("role", "status");
      status.setAttribute("aria-label", "Loading more titles");
      onRetry();
    });
    status.replaceChildren(retry);
  }
  // src/sidebar/seasonMenu.ts
  var selectorQuery = "[data-season-selector]";
  var triggerQuery = "[data-season-menu-trigger]";
  var optionQuery = "[data-season-option]";
  var labelQuery = "[data-season-menu-label]";
  var listenersInstalled = false;
  var selectionHandler = null;
  var labelUpdateFrame = null;
  function setupSeasonMenu(onSelect) {
    selectionHandler = onSelect;
    if (listenersInstalled) {
      return;
    }
    listenersInstalled = true;
    document.addEventListener("click", handleDocumentClick);
    document.addEventListener("keydown", handleDocumentKeydown);
    window.addEventListener("resize", scheduleSeasonMenuLabelUpdate, { passive: true });
  }
  function scheduleSeasonMenuLabelUpdate() {
    updateSeasonMenuLabels();
    if (labelUpdateFrame !== null) {
      cancelAnimationFrame(labelUpdateFrame);
    }
    labelUpdateFrame = requestAnimationFrame(() => {
      labelUpdateFrame = null;
      updateSeasonMenuLabels();
    });
  }
  function updateSeasonMenuLabels() {
    document.querySelectorAll(labelQuery).forEach((label) => {
      label.classList.toggle("season-selector-label--truncated", label.scrollWidth > label.clientWidth + 1);
    });
  }
  function handleDocumentClick(event) {
    const target = event.target instanceof Element ? event.target : null;
    const option = target?.closest(optionQuery);
    if (option) {
      const seasonId = option.dataset.seasonOption;
      if (!seasonId) {
        return;
      }
      closeSeasonMenus();
      selectionHandler?.(seasonId);
      window.setTimeout(() => {
        document.querySelector(triggerQuery)?.focus();
      }, 0);
      return;
    }
    const trigger = target?.closest(triggerQuery);
    if (trigger) {
      const selector = trigger.closest(selectorQuery);
      if (!selector) {
        return;
      }
      const shouldOpen = trigger.getAttribute("aria-expanded") !== "true";
      closeSeasonMenus(selector);
      setSeasonMenuOpen(selector, shouldOpen, shouldOpen ? "selected" : null);
      return;
    }
    closeSeasonMenus();
  }
  function handleDocumentKeydown(event) {
    const target = event.target instanceof Element ? event.target : null;
    const trigger = target?.closest(triggerQuery);
    if (trigger) {
      handleTriggerKeydown(event, trigger);
      return;
    }
    const option = target?.closest(optionQuery);
    if (option) {
      handleOptionKeydown(event, option);
    }
  }
  function handleTriggerKeydown(event, trigger) {
    const selector = trigger.closest(selectorQuery);
    if (!selector) {
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      closeSeasonMenus(selector);
      setSeasonMenuOpen(selector, true, event.key === "ArrowDown" ? "selected" : "last");
    } else if (event.key === "Escape") {
      event.preventDefault();
      setSeasonMenuOpen(selector, false);
    }
  }
  function handleOptionKeydown(event, option) {
    const selector = option.closest(selectorQuery);
    if (!selector) {
      return;
    }
    const options = Array.from(selector.querySelectorAll(optionQuery));
    const currentIndex = options.indexOf(option);
    if (event.key === "Escape") {
      event.preventDefault();
      setSeasonMenuOpen(selector, false);
      selector.querySelector(triggerQuery)?.focus();
      return;
    }
    if (event.key === "Tab") {
      setSeasonMenuOpen(selector, false);
      return;
    }
    let nextIndex = null;
    if (event.key === "ArrowDown") {
      nextIndex = (currentIndex + 1) % options.length;
    } else if (event.key === "ArrowUp") {
      nextIndex = (currentIndex - 1 + options.length) % options.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = options.length - 1;
    }
    if (nextIndex !== null) {
      event.preventDefault();
      options[nextIndex]?.focus();
    }
  }
  function closeSeasonMenus(except) {
    document.querySelectorAll(selectorQuery).forEach((selector) => {
      if (selector !== except) {
        setSeasonMenuOpen(selector, false);
      }
    });
  }
  function setSeasonMenuOpen(selector, open, focusTarget = null) {
    const trigger = selector.querySelector(triggerQuery);
    const menu = selector.querySelector("[data-season-menu]");
    if (!trigger || !menu) {
      return;
    }
    trigger.setAttribute("aria-expanded", String(open));
    menu.classList.toggle("hidden", !open);
    selector.classList.toggle("season-selector--open", open);
    if (!open || !focusTarget) {
      return;
    }
    const options = Array.from(menu.querySelectorAll(optionQuery));
    const target = focusTarget === "last" ? options[options.length - 1] : options.find((item) => item.getAttribute("aria-selected") === "true") || options[0];
    target?.focus();
  }

  // src/sidebar/views/elements.ts
  function buildDisclosureChevron() {
    const namespace = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(namespace, "svg");
    svg.setAttribute("width", "13");
    svg.setAttribute("height", "13");
    svg.setAttribute("viewBox", "0 0 14 14");
    svg.setAttribute("fill", "none");
    svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS(namespace, "path");
    path.setAttribute("d", "m5 2.5 4 4.5-4 4.5");
    path.setAttribute("stroke", "currentColor");
    path.setAttribute("stroke-width", "1.6");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    svg.appendChild(path);
    return svg;
  }

  // src/sidebar/views/details.ts
  function renderMovieDetails(item) {
    const details = buildMediaDetails(item, buildMediaDetailsViewModel(item), item);
    details.classList.add("movie-details");
    replaceContent(details);
    setBackdropDetail(item);
  }
  function renderSeriesDetails(item, seasons, selectedSeasonId, episodes, nextUpItem, episodeLoadState) {
    const nextUpLabel = nextUpItem ? getSeriesPlayLabel(nextUpItem) : "";
    const details = buildMediaDetails(item, buildMediaDetailsViewModel(item, seasons.length), nextUpItem, nextUpLabel);
    details.classList.add("series-details");
    details.appendChild(buildSeriesEpisodesSection(seasons, selectedSeasonId, episodes, episodeLoadState));
    replaceContent(details);
    setBackdropDetail(item);
    scheduleSeasonMenuLabelUpdate();
  }
  function renderSeriesEpisodes(seasons, selectedSeasonId, episodes, episodeLoadState) {
    const currentSection = ui.content.querySelector(".series-episodes");
    if (!currentSection) {
      return false;
    }
    currentSection.replaceWith(buildSeriesEpisodesSection(seasons, selectedSeasonId, episodes, episodeLoadState));
    scheduleSeasonMenuLabelUpdate();
    return true;
  }
  function buildMediaDetails(item, viewModel, playbackItem, playbackLabel = "") {
    const details = document.createElement("article");
    details.className = "media-details";
    details.appendChild(buildMediaDetailArtwork(item, playbackItem, playbackLabel));
    details.appendChild(buildMediaDetailInfo(viewModel));
    return details;
  }
  function buildMediaDetailInfo(viewModel) {
    const info = document.createElement("div");
    info.className = "media-detail-info";
    if (viewModel.metadata) {
      const metadata = document.createElement("p");
      metadata.className = "media-detail-meta";
      metadata.textContent = viewModel.metadata;
      info.appendChild(metadata);
    }
    if (viewModel.watched) {
      info.appendChild(buildMediaDetailWatchedState());
    }
    appendMediaDetailCopy(info, viewModel);
    return info;
  }
  function appendMediaDetailCopy(container, viewModel) {
    if (viewModel.tagline) {
      const taglineElement = document.createElement("p");
      taglineElement.className = "media-detail-tagline";
      taglineElement.textContent = viewModel.tagline;
      container.appendChild(taglineElement);
    }
    if (viewModel.overview) {
      const overview = document.createElement("p");
      overview.className = "media-detail-overview";
      overview.textContent = viewModel.overview;
      container.appendChild(overview);
    }
  }
  function buildMediaDetailArtwork(item, playbackItem, playbackLabel) {
    const artwork = buildMediaDetailArtworkContainer(item, playbackItem, playbackLabel);
    artwork.appendChild(buildMediaDetailImage(item));
    appendMediaDetailPlaybackState(artwork, playbackItem);
    return artwork;
  }
  function buildMediaDetailArtworkContainer(item, playbackItem, playbackLabel) {
    if (!playbackItem) {
      const artwork2 = document.createElement("div");
      artwork2.className = "media-detail-artwork";
      return artwork2;
    }
    const artwork = document.createElement("button");
    artwork.className = "media-detail-artwork";
    artwork.type = "button";
    applyDetailPlaybackContext(artwork, playbackItem);
    const label = getDetailPlaybackLabel(item, playbackItem, playbackLabel);
    artwork.setAttribute("aria-label", label);
    artwork.title = label;
    return artwork;
  }
  function buildMediaDetailImage(item) {
    const image = document.createElement("img");
    image.className = "media-detail-image";
    image.src = getImageUrl(item.Id || "", "Thumb", 1000);
    image.dataset.fallback = getImageUrl(item.Id || "", "Backdrop", 1000);
    image.dataset.itemId = item.Id || "";
    image.dataset.type = item.Type || "";
    image.alt = "";
    return image;
  }
  function appendMediaDetailPlaybackState(artwork, playbackItem) {
    const progress = playbackItem ? buildThumbProgressElement(getProgressPercent(playbackItem)) : null;
    if (progress) {
      artwork.appendChild(progress);
    }
    if (playbackItem?.UserData?.Played) {
      artwork.appendChild(buildWatchedIndicator());
    }
  }
  function buildMediaDetailWatchedState() {
    const watched = document.createElement("div");
    watched.className = "media-detail-watched";
    watched.innerHTML = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="m3 7.2 2.5 2.5L11.2 4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Watched</span>';
    return watched;
  }
  function applyDetailPlaybackContext(element, item) {
    const resumeTicks = item.UserData?.Played ? 0 : item.UserData?.PlaybackPositionTicks || 0;
    element.dataset.detailPlay = "";
    element.dataset.id = item.Id || "";
    element.dataset.name = String(item.Name || "Untitled");
    element.dataset.resume = String(resumeTicks);
    element.dataset.seriesId = item.SeriesId || "";
    element.dataset.seasonId = item.SeasonId || item.ParentId || "";
    element.dataset.episodeIndex = item.IndexNumber === undefined || item.IndexNumber === null ? "" : String(item.IndexNumber);
    element.setAttribute("data-clickable", "");
  }
  function buildSeriesEpisodesSection(seasons, selectedSeasonId, episodes, loadState) {
    const section = document.createElement("section");
    section.className = "series-episodes";
    if (seasons.length > 0) {
      section.appendChild(buildSeasonSelector(seasons, selectedSeasonId));
    }
    const status = buildEpisodeLoadStatus(loadState);
    if (status) {
      section.appendChild(status);
      return section;
    }
    if (episodes.length === 0) {
      const empty = document.createElement("p");
      empty.className = "series-episode-empty";
      empty.textContent = "No episodes in this season.";
      section.appendChild(empty);
      return section;
    }
    const list = buildMediaList(episodes, {
      showSeriesName: false,
      showEpisodeNumber: true,
      useEpisodeThumbnail: true,
      episodeRow: true
    });
    list.classList.add("series-episode-list");
    section.appendChild(list);
    return section;
  }
  function buildSeasonSelector(seasons, selectedSeasonId) {
    const controls = document.createElement("div");
    controls.className = "series-episodes-controls";
    const selector = document.createElement("div");
    selector.className = "season-selector";
    selector.dataset.seasonSelector = "";
    const selectedSeason = seasons.find((season) => season.Id === selectedSeasonId) || seasons[0];
    const trigger = document.createElement("button");
    trigger.className = "season-selector-trigger";
    trigger.type = "button";
    trigger.dataset.seasonMenuTrigger = "";
    trigger.setAttribute("data-clickable", "");
    trigger.setAttribute("aria-label", `Choose season, selected ${String(selectedSeason?.Name || "Season")}`);
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute("aria-controls", "season-selector-menu");
    const label = document.createElement("span");
    label.className = "season-selector-label";
    label.dataset.seasonMenuLabel = "";
    label.textContent = String(selectedSeason?.Name || "Season");
    trigger.append(label, buildDisclosureChevron());
    const menu = document.createElement("div");
    menu.id = "season-selector-menu";
    menu.className = "season-selector-menu hidden";
    menu.dataset.seasonMenu = "";
    menu.setAttribute("role", "listbox");
    menu.setAttribute("aria-label", "Season");
    seasons.forEach((season) => {
      const option = document.createElement("button");
      option.className = "season-selector-option";
      option.type = "button";
      option.dataset.seasonOption = season.Id || "";
      option.setAttribute("data-clickable", "");
      option.setAttribute("role", "option");
      option.setAttribute("aria-selected", String(season.Id === selectedSeason?.Id));
      option.tabIndex = -1;
      option.textContent = String(season.Name || "Season");
      menu.appendChild(option);
    });
    selector.append(trigger, menu);
    controls.appendChild(selector);
    return controls;
  }
  function buildEpisodeLoadStatus(loadState) {
    if (loadState === "loading") {
      const status = document.createElement("div");
      status.className = "series-episode-status";
      status.setAttribute("role", "status");
      status.setAttribute("aria-label", "Loading episodes");
      status.appendChild(buildLibraryLoadingSpinner());
      return status;
    }
    if (loadState === "error") {
      const status = document.createElement("div");
      status.className = "series-episode-status series-episode-status--error";
      const message = document.createElement("p");
      message.textContent = "Couldn’t load episodes.";
      const retry = document.createElement("button");
      retry.className = "btn-secondary";
      retry.type = "button";
      retry.dataset.seasonRetry = "";
      retry.textContent = "Try Again";
      status.append(message, retry);
      return status;
    }
    return null;
  }
  // src/sidebar/views/home.ts
  var homeRailResizeHandlerInstalled = false;
  function renderHomeSections(continueWatchingItems, newestEpisodes, recentMovies, recentSeries) {
    const home = document.createElement("div");
    home.className = "home-sections";
    const sections = buildHomeSections(continueWatchingItems, newestEpisodes, recentMovies, recentSeries);
    sections.forEach((section) => home.appendChild(buildHomeSection(section)));
    replaceContent(home);
    setBackdropSlideshow(sections.flatMap((section) => section.items));
    installHomeRailResizeHandler();
    requestAnimationFrame(updateAllHomeRailShadows);
  }
  function buildHomeSections(continueWatchingItems, newestEpisodes, recentMovies, recentSeries) {
    return [
      {
        id: "continue-watching",
        title: "Continue watching",
        items: continueWatchingItems,
        options: {
          homeThumbnail: true,
          directPlay: true,
          showSeriesName: true,
          showEpisodeNumber: true,
          hideRuntime: true,
          ...getNextUpImageOptions()
        }
      },
      {
        id: "new",
        title: "New episodes",
        items: newestEpisodes,
        options: {
          homeThumbnail: true,
          directPlay: true,
          showSeriesName: true,
          showEpisodeNumber: true,
          hideRuntime: true,
          useEpisodeThumbnail: true
        }
      },
      {
        id: "movies",
        title: "Movies",
        items: recentMovies,
        options: { homePoster: true, usePosterImage: true, showSeriesName: false },
        libraryType: "movies"
      },
      {
        id: "series",
        title: "Series",
        items: recentSeries,
        options: { homePoster: true, usePosterImage: true, showSeriesName: false },
        libraryType: "tvshows"
      }
    ];
  }
  function buildHomeSection(sectionModel) {
    const { id, title, items, options, libraryType } = sectionModel;
    const section = document.createElement("section");
    section.className = "home-shelf";
    section.appendChild(buildHomeSectionHeading(title, libraryType));
    if (items.length > 0) {
      section.appendChild(buildHomeMediaRail(title, items, options));
    } else {
      const empty = buildFeedbackState("Nothing Here Yet", getHomeEmptyDetail(id));
      empty.classList.add("home-shelf-empty");
      section.appendChild(empty);
    }
    return section;
  }
  function buildHomeSectionHeading(title, libraryType) {
    const heading = document.createElement("h3");
    if (!libraryType) {
      heading.textContent = title;
      return heading;
    }
    const link = document.createElement("button");
    link.className = "home-section-link";
    link.type = "button";
    link.dataset.homeLibrary = libraryType;
    link.dataset.homeLibraryName = title;
    link.setAttribute("aria-label", `Open ${title}`);
    const label = document.createElement("span");
    label.textContent = title;
    link.append(label, buildDisclosureChevron());
    heading.appendChild(link);
    return heading;
  }
  function buildHomeMediaRail(title, items, options) {
    const rail = document.createElement("div");
    rail.className = "home-media-rail";
    rail.classList.toggle("home-media-rail--thumbnail", Boolean(options.homeThumbnail));
    const row = document.createElement("div");
    row.className = "home-media-row";
    row.setAttribute("aria-label", title);
    items.forEach((item) => row.appendChild(buildListCardElement(item, options)));
    installHorizontalDrag(row);
    row.addEventListener("scroll", () => updateHomeRailShadow(row), { passive: true });
    rail.append(buildHomeRailButton(row, title, -1), buildHomeRailButton(row, title, 1), row);
    return rail;
  }
  function buildHomeRailButton(row, sectionTitle, direction) {
    const isPrevious = direction === -1;
    const button = document.createElement("button");
    button.className = `home-scroll-button home-scroll-button--${isPrevious ? "previous" : "next"}`;
    button.type = "button";
    button.setAttribute("aria-label", `${isPrevious ? "Previous" : "Next"} ${sectionTitle}`);
    button.innerHTML = `<svg width="17" height="17" viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="m${isPrevious ? "11.5 3.5-5 5.5 5 5.5" : "6.5 3.5 5 5.5-5 5.5"}" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    button.addEventListener("click", () => {
      row.scrollBy({
        left: direction * row.clientWidth * 0.8,
        behavior: "smooth"
      });
    });
    return button;
  }
  function installHorizontalDrag(row) {
    let pointerId = null;
    let startX = 0;
    let startScrollLeft = 0;
    let dragging = false;
    let suppressClick = false;
    row.addEventListener("pointerdown", (event) => {
      if (event.pointerType !== "mouse" || event.button !== 0 || pointerId !== null || row.scrollWidth <= row.clientWidth + 1) {
        return;
      }
      pointerId = event.pointerId;
      startX = event.clientX;
      startScrollLeft = row.scrollLeft;
    });
    row.addEventListener("pointermove", (event) => {
      if (pointerId !== event.pointerId) {
        return;
      }
      const distance = event.clientX - startX;
      if (!dragging && Math.abs(distance) < 5) {
        return;
      }
      if (!dragging) {
        dragging = true;
        row.classList.add("home-media-row--dragging");
        row.setPointerCapture(event.pointerId);
      }
      event.preventDefault();
      row.scrollLeft = startScrollLeft - distance;
    });
    row.addEventListener("pointerleave", () => {
      if (!dragging) {
        pointerId = null;
      }
    });
    const finishDrag = (event) => {
      if (pointerId !== event.pointerId) {
        return;
      }
      pointerId = null;
      if (!dragging) {
        return;
      }
      dragging = false;
      suppressClick = true;
      row.classList.remove("home-media-row--dragging");
      if (row.hasPointerCapture(event.pointerId)) {
        row.releasePointerCapture(event.pointerId);
      }
      window.setTimeout(() => {
        suppressClick = false;
      }, 0);
    };
    row.addEventListener("pointerup", finishDrag);
    row.addEventListener("pointercancel", finishDrag);
    row.addEventListener("click", (event) => {
      if (suppressClick) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    }, true);
    row.addEventListener("dragstart", (event) => event.preventDefault());
  }
  function installHomeRailResizeHandler() {
    if (homeRailResizeHandlerInstalled) {
      return;
    }
    homeRailResizeHandlerInstalled = true;
    window.addEventListener("resize", updateAllHomeRailShadows, { passive: true });
  }
  function updateAllHomeRailShadows() {
    ui.content.querySelectorAll(".home-media-row").forEach(updateHomeRailShadow);
  }
  function updateHomeRailShadow(row) {
    const rail = row.closest(".home-media-rail");
    if (!rail) {
      return;
    }
    const maximumScroll = Math.max(row.scrollWidth - row.clientWidth, 0);
    const canScrollLeft = row.scrollLeft > 1;
    const canScrollRight = row.scrollLeft < maximumScroll - 1;
    rail.classList.toggle("can-scroll-left", canScrollLeft);
    rail.classList.toggle("can-scroll-right", canScrollRight);
    const previous = rail.querySelector(".home-scroll-button--previous");
    const next = rail.querySelector(".home-scroll-button--next");
    if (previous) {
      previous.disabled = !canScrollLeft;
    }
    if (next) {
      next.disabled = !canScrollRight;
    }
  }
  function getHomeEmptyDetail(section) {
    if (section === "continue-watching") {
      return "Partially watched movies and your next episodes will appear here.";
    }
    return "Newly added titles will appear here.";
  }
  // src/sidebar/views/search.ts
  var cachedSearchResults = [];
  function renderSearchResults(items) {
    cachedSearchResults = [...items];
    renderFilteredSearchResults();
  }
  function setSearchFilter(filter) {
    state.searchFilter = filter;
    ui.searchFilters.querySelectorAll("[data-search-filter]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.searchFilter === filter));
    });
    renderFilteredSearchResults();
  }
  function renderFilteredSearchResults() {
    const viewModel = buildSearchResultsViewModel(cachedSearchResults, state.searchFilter);
    if (viewModel.visibleItems.length === 0) {
      renderEmptyState(viewModel.emptyMessage);
      return;
    }
    const results = document.createElement("div");
    results.className = "search-results";
    if (viewModel.posterItems.length > 0) {
      results.appendChild(buildSearchResultGroup(viewModel.posterItems, "library-poster-grid"));
    }
    if (viewModel.remainingItems.length > 0) {
      results.appendChild(buildSearchResultGroup(viewModel.remainingItems, "media-list"));
    }
    replaceContent(results);
    setBackdropSlideshow(viewModel.visibleItems);
  }
  function buildSearchResultGroup(items, className) {
    const group = document.createElement("div");
    group.className = className;
    items.forEach((item) => group.appendChild(buildListCardElement(item, getSearchCardOptions(item))));
    return group;
  }
  // src/sidebar/playbackService.ts
  function createPlayItem(dependencies) {
    return async function playItem(itemId, name, resumePositionTicks = 0, context = {}, preferredTitle = "") {
      try {
        const playbackInfo = await dependencies.fetchPlaybackInfo(itemId);
        if (!playbackInfo) {
          throw new Error("Missing playback info");
        }
        const itemDetails = await dependencies.fetchItemDetails(itemId);
        const connection = dependencies.getConnection();
        const resolvedContext = resolvePlaybackContext(context, itemDetails);
        const playback = buildPlaybackHandoff(playbackInfo, {
          ...connection,
          deviceId: dependencies.getDeviceId(),
          itemId,
          runtimeTicks: itemDetails?.RunTimeTicks,
          ...resolvedContext
        });
        const title = preferredTitle || buildJellyfinWindowTitle(itemDetails, name) || name;
        dependencies.send({
          playback,
          resumeSeconds: toResumeSeconds(resumePositionTicks),
          title
        });
      } catch (error) {
        dependencies.reportError(error);
      }
    };
  }
  function resolvePlaybackContext(preferred, item) {
    return {
      seriesId: preferred.seriesId || item?.SeriesId || "",
      seasonId: preferred.seasonId || item?.SeasonId || item?.ParentId || "",
      episodeIndex: preferred.episodeIndex ?? item?.IndexNumber
    };
  }
  function toResumeSeconds(resumePositionTicks) {
    return resumePositionTicks > 0 ? Math.floor(resumePositionTicks / TICKS_PER_SECOND) : 0;
  }

  // src/sidebar/playback.ts
  var playItem = createPlayItem({
    fetchPlaybackInfo,
    fetchItemDetails,
    getConnection: () => ({
      serverUrl: state.serverUrl,
      accessToken: state.accessToken,
      userId: state.userId
    }),
    getDeviceId,
    send: (message) => iina.postMessage(MESSAGE_NAMES.PlayItem, message),
    reportError: (error) => {
      console.error("Failed to get playback info:", error);
      showError(error instanceof Error ? error.message : "Unable to start playback.");
    }
  });

  // src/sidebar/runtimeUtils.ts
  function log(...args) {
    if (DEBUG_LOGS) {
      console.log("Jellyfin UI:", ...args);
    }
  }
  function getServerHost(serverUrl) {
    try {
      return new URL(serverUrl).hostname;
    } catch (error) {
      return serverUrl;
    }
  }
  function normalizeQuery(value) {
    return value.trim().toLowerCase();
  }

  // src/sidebar/requests/coordinator.ts
  class LatestRequest {
    generation = 0;
    begin() {
      this.generation += 1;
      return this.generation;
    }
    cancel() {
      this.generation += 1;
    }
    isCurrent(token) {
      return token === this.generation;
    }
  }

  class RequestCache {
    values = new Map;
    get(key) {
      return this.values.get(key);
    }
    set(key, value) {
      this.values.set(key, value);
    }
    clear() {
      this.values.clear();
    }
  }

  // src/sidebar/requests/details.ts
  function createDetailsRequests(port) {
    async function loadNextUp(userId, seriesId) {
      try {
        const endpoint = buildSeriesNextUpEndpoint(userId, seriesId);
        const data = await port.requestJson("GET", endpoint);
        return (data?.Items || []).find((item) => item.Type === "Episode") || null;
      } catch {
        return null;
      }
    }
    return {
      loadItem: (itemId) => port.fetchItemDetails(itemId),
      async loadSeries(userId, seriesId) {
        const seasonsEndpoint = buildSeasonsEndpoint(userId, seriesId);
        const [details, nextUpItem, seasonsData] = await Promise.all([
          port.fetchItemDetails(seriesId),
          loadNextUp(userId, seriesId),
          port.requestJson("GET", seasonsEndpoint)
        ]);
        return {
          details,
          nextUpItem,
          seasons: seasonsData?.Items || []
        };
      },
      async loadEpisodes(userId, seriesId, seasonId) {
        const endpoint = buildEpisodesEndpoint(userId, seriesId, seasonId);
        const data = await port.requestJson("GET", endpoint);
        return data?.Items || [];
      }
    };
  }
  function getDefaultSeasonId(seasons, nextUpItem) {
    const nextUpSeasonId = nextUpItem?.SeasonId || nextUpItem?.ParentId || "";
    if (nextUpSeasonId && seasons.some((season) => season.Id === nextUpSeasonId)) {
      return nextUpSeasonId;
    }
    return seasons.find((season) => (season.IndexNumber || 0) > 0)?.Id || seasons[0]?.Id || "";
  }

  // src/sidebar/requests/home.ts
  function createHomeRequests(port) {
    async function loadLatestItems(userId, itemType, limit) {
      const endpoint = buildLatestItemsEndpoint(userId, itemType, limit);
      const data = await port.requestJson("GET", endpoint);
      return (data || []).filter(isSupportedItem);
    }
    async function loadResumeItems(userId) {
      const endpoint = buildResumeItemsEndpoint(userId);
      const data = await port.requestJson("GET", endpoint);
      return (data?.Items || []).filter(isSupportedItem);
    }
    async function loadNextUpItems(userId) {
      const endpoint = buildNextUpItemsEndpoint(userId);
      const data = await port.requestJson("GET", endpoint);
      return (data?.Items || []).filter(isSupportedItem);
    }
    async function loadContinueWatching(userId, limit) {
      const resumeItems = await loadResumeItems(userId);
      const nextUpItems = await loadNextUpItems(userId);
      return mergeItems(resumeItems, nextUpItems).slice(0, limit);
    }
    async function loadSeriesWithNewestSeasons(userId, limit) {
      const pageSize = 20;
      const maximumSeasonRecords = 100;
      const seriesIds = [];
      const seen = new Set;
      for (let startIndex = 0;startIndex < maximumSeasonRecords; startIndex += pageSize) {
        const endpoint2 = buildNewestSeasonsEndpoint(userId, startIndex, pageSize);
        const data2 = await port.requestJson("GET", endpoint2);
        const seasons = data2?.Items || [];
        for (const season of seasons) {
          const seriesId = season.SeriesId || season.ParentId;
          if (seriesId && !seen.has(seriesId)) {
            seen.add(seriesId);
            seriesIds.push(seriesId);
            if (seriesIds.length === limit) {
              break;
            }
          }
        }
        if (seriesIds.length === limit || seasons.length < pageSize) {
          break;
        }
      }
      if (seriesIds.length === 0) {
        return [];
      }
      const endpoint = buildItemsByIdsEndpoint(userId, seriesIds, "Series");
      const data = await port.requestJson("GET", endpoint);
      const seriesById = new Map((data?.Items || []).filter((item) => item.Id && item.Type === "Series").map((item) => [item.Id, item]));
      return seriesIds.map((seriesId) => seriesById.get(seriesId)).filter((item) => Boolean(item)).slice(0, limit);
    }
    return {
      async load(userId, limit) {
        const [continueWatchingItems, newestEpisodes, recentMovies, recentSeries] = await Promise.all([
          loadContinueWatching(userId, limit),
          loadLatestItems(userId, "Episode", limit),
          loadLatestItems(userId, "Movie", limit),
          loadSeriesWithNewestSeasons(userId, limit)
        ]);
        return { continueWatchingItems, newestEpisodes, recentMovies, recentSeries };
      }
    };
  }
  function mergeItems(primary, secondary) {
    const seen = new Set;
    const combined = [];
    for (const item of [...primary, ...secondary]) {
      if (item.Id && !seen.has(item.Id)) {
        seen.add(item.Id);
        combined.push(item);
      }
    }
    return combined;
  }
  function isSupportedItem(item) {
    return Boolean(item && (item.Type === "Movie" || item.Type === "Episode" || item.Type === "Series"));
  }

  // src/sidebar/requests/library.ts
  function createLibraryRequests(port) {
    return {
      async loadPage(request) {
        const endpoint = buildLibraryItemsEndpoint(request.userId, request.libraryId, request.collectionType, request.startIndex, request.limit);
        const data = await port.requestJson("GET", endpoint);
        const items = data?.Items || [];
        const totalItemCount = data?.TotalRecordCount ?? request.startIndex + items.length;
        const hasMore = data?.TotalRecordCount === undefined ? items.length === request.limit : request.startIndex + items.length < totalItemCount;
        return { items, totalItemCount, hasMore };
      }
    };
  }

  // src/sidebar/requests/search.ts
  function createSearchRequests(port) {
    return {
      async search(userId, query) {
        const endpoint = buildSearchEndpoint(userId, query);
        const data = await port.requestJson("GET", endpoint);
        return rankSearchResults((data?.Items || []).filter(isSupportedItem), query);
      }
    };
  }
  function rankSearchResults(items, query) {
    const normalizedQuery = query.toLocaleLowerCase();
    return items.map((item, index) => ({ item, index, score: getSearchScore(item, normalizedQuery) })).sort((left, right) => right.score - left.score || left.index - right.index).map((result) => result.item);
  }
  function getSearchScore(item, query) {
    const name = String(item.Name || "").toLocaleLowerCase();
    const seriesName = String(item.SeriesName || "").toLocaleLowerCase();
    return scoreSearchText(name, query) + Math.round(scoreSearchText(seriesName, query) * 0.45);
  }
  function scoreSearchText(value, query) {
    if (!value || !query) {
      return 0;
    }
    if (value === query) {
      return 1000;
    }
    if (value.startsWith(query)) {
      return 800;
    }
    if (value.split(/\s+/).some((word) => word.startsWith(query))) {
      return 650;
    }
    return value.includes(query) ? 500 : 0;
  }

  // src/sidebar/requests/index.ts
  function createSidebarRequests(port) {
    return {
      home: createHomeRequests(port),
      library: createLibraryRequests(port),
      details: createDetailsRequests(port),
      search: createSearchRequests(port)
    };
  }

  // src/adapters/browser/sidebarRequests.ts
  var sidebarRequests = createSidebarRequests({
    requestJson: apiRequest,
    fetchItemDetails
  });

  // src/sidebar/controllers/loaders.ts
  var LIBRARY_PAGE_SIZE = 60;
  var HOME_SECTION_ITEM_LIMIT = 8;
  var viewRequests = new LatestRequest;
  var libraryPageRequests = new LatestRequest;
  var seriesSeasonRequests = new LatestRequest;
  var homeViewCache = new RequestCache;
  var libraryViewCache = new RequestCache;
  var movieDetailsCache = new RequestCache;
  var seriesDetailsCache = new RequestCache;
  var currentSeriesView = null;
  function cancelPendingViewRequest() {
    viewRequests.cancel();
    libraryPageRequests.cancel();
    seriesSeasonRequests.cancel();
  }
  function beginViewRequest() {
    libraryPageRequests.cancel();
    seriesSeasonRequests.cancel();
    return viewRequests.begin();
  }
  function clearSidebarRequestCaches() {
    homeViewCache.clear();
    libraryViewCache.clear();
    movieDetailsCache.clear();
    seriesDetailsCache.clear();
    currentSeriesView = null;
    cancelPendingViewRequest();
  }
  async function fetchAndRenderLibraryItems(options) {
    libraryPageRequests.cancel();
    seriesSeasonRequests.cancel();
    const cacheKey = getLibraryCacheKey(options.libraryId, options.collectionType);
    sidebarStore.setRetryOperation({
      kind: "library",
      id: options.libraryId,
      name: options.libraryName,
      collectionType: options.collectionType
    });
    const cachedLibrary = libraryViewCache.get(cacheKey);
    if (cachedLibrary) {
      viewRequests.cancel();
      setCurrentLibraryContext(cachedLibrary, options);
      updateTitle(options.libraryName);
      hideLoading();
      if (cachedLibrary.items.length === 0) {
        renderEmptyState("No items found");
      } else {
        renderLibraryGrid(cachedLibrary.items, cachedLibrary.hasMore, loadMoreLibraryItems);
      }
      restoreLibraryScrollPosition(cachedLibrary.scrollTop);
      return;
    }
    const requestId = beginViewRequest();
    const library = {
      id: options.libraryId,
      name: options.libraryName,
      type: options.collectionType,
      items: [],
      totalItemCount: 0,
      hasMore: false,
      isLoadingMore: false,
      scrollTop: 0
    };
    setCurrentLibraryContext(library, options);
    updateTitle(options.libraryName);
    showLoading("library");
    try {
      const page = await sidebarRequests.library.loadPage({
        userId: state.userId,
        libraryId: options.libraryId,
        collectionType: options.collectionType,
        startIndex: 0,
        limit: LIBRARY_PAGE_SIZE
      });
      if (!viewRequests.isCurrent(requestId)) {
        return;
      }
      const items = page.items;
      library.items = items;
      library.totalItemCount = page.totalItemCount;
      library.hasMore = page.hasMore;
      libraryViewCache.set(cacheKey, library);
      updateTitle(state.breadcrumb[state.breadcrumb.length - 1]?.name || options.libraryName);
      hideLoading();
      if (items.length === 0) {
        renderEmptyState("No items found");
        return;
      }
      renderLibraryGrid(items, library.hasMore, loadMoreLibraryItems);
      restoreLibraryScrollPosition(0);
    } catch (error) {
      if (!viewRequests.isCurrent(requestId)) {
        return;
      }
      showError(error instanceof Error ? error.message : "Failed to load items");
    }
  }
  function setCurrentLibraryContext(library, options) {
    state.currentLibrary = library;
    state.currentSeries = null;
    currentSeriesView = null;
    if (options.addBreadcrumb) {
      sidebarStore.navigateLibrary(options.libraryId, options.libraryName, options.collectionType);
    }
  }
  async function loadMoreLibraryItems() {
    const library = state.currentLibrary;
    if (!library || library.isLoadingMore || !library.hasMore || !isCurrentLibraryView()) {
      return;
    }
    library.isLoadingMore = true;
    const requestId = libraryPageRequests.begin();
    try {
      const page = await sidebarRequests.library.loadPage({
        userId: state.userId,
        libraryId: library.id,
        collectionType: library.type,
        startIndex: library.items.length,
        limit: LIBRARY_PAGE_SIZE
      });
      if (!libraryPageRequests.isCurrent(requestId) || library !== state.currentLibrary || !isCurrentLibraryView()) {
        return;
      }
      const knownIds = new Set(library.items.map((item) => item.Id).filter(Boolean));
      const newItems = page.items.filter((item) => !item.Id || !knownIds.has(item.Id));
      library.items.push(...newItems);
      library.totalItemCount = page.totalItemCount;
      library.hasMore = newItems.length > 0 && page.hasMore;
      appendLibraryGridItems(newItems, library.hasMore);
    } catch {
      if (libraryPageRequests.isCurrent(requestId) && library === state.currentLibrary && isCurrentLibraryView()) {
        showLibraryGridLoadError(() => void loadMoreLibraryItems());
      }
    } finally {
      library.isLoadingMore = false;
    }
  }
  function saveCurrentLibraryScrollPosition() {
    if (state.currentLibrary && isCurrentLibraryView(true)) {
      state.currentLibrary.scrollTop = window.scrollY;
    }
  }
  function restoreLibraryScrollPosition(scrollTop) {
    requestAnimationFrame(() => window.scrollTo(0, scrollTop));
  }
  function isCurrentLibraryView(ignoreSearch = false) {
    const current = state.breadcrumb[state.breadcrumb.length - 1];
    return current?.type === "library" && (ignoreSearch || !state.searchQuery);
  }
  async function fetchAndRenderMovieDetails(options) {
    currentSeriesView = null;
    state.currentSeries = null;
    if (options.addBreadcrumb) {
      sidebarStore.navigateToDetails({ kind: "movie", id: options.movieId, name: options.movieName });
    }
    const requestId = beginViewRequest();
    const cacheKey = `${getSessionCacheKey()}\x00movie\x00${options.movieId}`;
    const cachedMovie = movieDetailsCache.get(cacheKey);
    sidebarStore.setRetryOperation({ kind: "movie", id: options.movieId, name: options.movieName });
    updateTitle(options.movieName);
    window.scrollTo(0, 0);
    if (cachedMovie) {
      hideLoading();
      renderMovieDetails(cachedMovie);
      return;
    }
    showLoading("details");
    try {
      const movie = await sidebarRequests.details.loadItem(options.movieId);
      if (!viewRequests.isCurrent(requestId)) {
        return;
      }
      if (!movie) {
        throw new Error("Movie details are unavailable");
      }
      movieDetailsCache.set(cacheKey, movie);
      updateTitle(String(movie.Name || options.movieName));
      hideLoading();
      renderMovieDetails(movie);
    } catch (error) {
      if (!viewRequests.isCurrent(requestId)) {
        return;
      }
      showError(error instanceof Error ? error.message : "Failed to load movie details");
    }
  }
  async function fetchAndRenderSeriesDetails(options) {
    if (options.addBreadcrumb) {
      sidebarStore.navigateToDetails({ kind: "series", id: options.seriesId, name: options.seriesName });
    }
    const requestId = beginViewRequest();
    const cacheKey = getSeriesDetailsCacheKey(options.seriesId);
    updateTitle(options.seriesName);
    window.scrollTo(0, 0);
    sidebarStore.setRetryOperation({ kind: "series", id: options.seriesId, name: options.seriesName });
    const cachedSeries = seriesDetailsCache.get(cacheKey);
    if (cachedSeries) {
      setCurrentSeriesView(cachedSeries);
      hideLoading();
      renderSeriesView(cachedSeries, getSeriesEpisodeLoadState(cachedSeries), 0);
      if (cachedSeries.selectedSeasonId && !cachedSeries.episodesBySeason.has(cachedSeries.selectedSeasonId)) {
        loadSeriesSeason(cachedSeries, cachedSeries.selectedSeasonId, 0, false);
      }
      return;
    }
    showLoading("details");
    try {
      const { details, nextUpItem, seasons } = await sidebarRequests.details.loadSeries(state.userId, options.seriesId);
      if (!viewRequests.isCurrent(requestId)) {
        return;
      }
      if (!details) {
        throw new Error("Series details are unavailable");
      }
      const view = {
        details,
        seasons,
        nextUpItem,
        selectedSeasonId: getDefaultSeasonId(seasons, nextUpItem),
        episodesBySeason: new Map
      };
      seriesDetailsCache.set(cacheKey, view);
      setCurrentSeriesView(view);
      updateTitle(String(details.Name || options.seriesName));
      hideLoading();
      if (view.selectedSeasonId) {
        renderSeriesView(view, "loading", 0);
        loadSeriesSeason(view, view.selectedSeasonId, 0, false);
      } else {
        renderSeriesView(view, "ready", 0);
      }
    } catch (error) {
      if (!viewRequests.isCurrent(requestId)) {
        return;
      }
      showError(error instanceof Error ? error.message : "Failed to load series details");
    }
  }
  async function loadSeriesSeason(view, seasonId, scrollTop, forceReload) {
    view.selectedSeasonId = seasonId;
    if (state.currentSeries) {
      state.currentSeries.selectedSeasonId = seasonId;
    }
    const cachedEpisodes = forceReload ? undefined : view.episodesBySeason.get(seasonId);
    if (cachedEpisodes) {
      renderSeriesSeason(view, "ready", scrollTop);
      return;
    }
    const requestId = seriesSeasonRequests.begin();
    renderSeriesSeason(view, "loading", scrollTop);
    try {
      const episodes = await sidebarRequests.details.loadEpisodes(state.userId, view.details.Id || "", seasonId);
      if (!seriesSeasonRequests.isCurrent(requestId) || currentSeriesView !== view || view.selectedSeasonId !== seasonId) {
        return;
      }
      view.episodesBySeason.set(seasonId, episodes);
      renderSeriesSeason(view, "ready", scrollTop);
    } catch {
      if (!seriesSeasonRequests.isCurrent(requestId) || currentSeriesView !== view) {
        return;
      }
      renderSeriesSeason(view, "error", scrollTop);
    }
  }
  function setCurrentSeriesView(view) {
    currentSeriesView = view;
    state.currentSeries = {
      id: view.details.Id || "",
      name: String(view.details.Name || "Series"),
      selectedSeasonId: view.selectedSeasonId
    };
  }
  function getSeriesEpisodeLoadState(view) {
    return !view.selectedSeasonId || view.episodesBySeason.has(view.selectedSeasonId) ? "ready" : "loading";
  }
  function renderSeriesView(view, loadState, scrollTop) {
    renderSeriesDetails(view.details, view.seasons, view.selectedSeasonId, view.episodesBySeason.get(view.selectedSeasonId) || [], view.nextUpItem, loadState);
    requestAnimationFrame(() => window.scrollTo(0, scrollTop));
  }
  function renderSeriesSeason(view, loadState, scrollTop) {
    const updated = renderSeriesEpisodes(view.seasons, view.selectedSeasonId, view.episodesBySeason.get(view.selectedSeasonId) || [], loadState);
    if (!updated) {
      renderSeriesView(view, loadState, scrollTop);
      return;
    }
    requestAnimationFrame(() => window.scrollTo(0, scrollTop));
  }
  async function reloadItems(breadcrumb) {
    await fetchAndRenderLibraryItems({
      libraryId: breadcrumb.id,
      libraryName: breadcrumb.name,
      collectionType: breadcrumb.collectionType,
      addBreadcrumb: false
    });
  }
  async function reloadSeriesDetails(breadcrumb) {
    await fetchAndRenderSeriesDetails({
      seriesId: breadcrumb.id,
      seriesName: breadcrumb.name,
      addBreadcrumb: false
    });
  }
  async function loadHome(forceReload = false) {
    const requestId = beginViewRequest();
    sidebarStore.navigateHome();
    state.currentLibrary = null;
    state.currentSeries = null;
    currentSeriesView = null;
    sidebarStore.setRetryOperation({ kind: "home", forceReload: true });
    updateTitle("Home");
    const cacheKey = getSessionCacheKey();
    const cachedHome = forceReload ? undefined : homeViewCache.get(cacheKey);
    if (cachedHome) {
      hideLoading();
      renderHomeSections(cachedHome.continueWatchingItems, cachedHome.newestEpisodes, cachedHome.recentMovies, cachedHome.recentSeries);
      return;
    }
    showLoading("home");
    try {
      const home = await sidebarRequests.home.load(state.userId, HOME_SECTION_ITEM_LIMIT);
      if (!viewRequests.isCurrent(requestId)) {
        return;
      }
      homeViewCache.set(cacheKey, home);
      renderHomeSections(home.continueWatchingItems, home.newestEpisodes, home.recentMovies, home.recentSeries);
      hideLoading();
    } catch (error) {
      if (!viewRequests.isCurrent(requestId)) {
        return;
      }
      showError(error instanceof Error ? error.message : "Failed to load items");
    }
  }
  function getSessionCacheKey() {
    return `${state.serverUrl}\x00${state.userId}`;
  }
  function getLibraryCacheKey(libraryId, collectionType) {
    return `${getSessionCacheKey()}\x00${collectionType}\x00${libraryId}`;
  }
  function getSeriesDetailsCacheKey(seriesId) {
    return `${getSessionCacheKey()}\x00series\x00${seriesId}`;
  }
  async function loadItems(libraryId, libraryName, collectionType) {
    await fetchAndRenderLibraryItems({
      libraryId,
      libraryName,
      collectionType,
      addBreadcrumb: true
    });
  }
  async function loadSeriesDetails(seriesId, seriesName) {
    await fetchAndRenderSeriesDetails({
      seriesId,
      seriesName,
      addBreadcrumb: true
    });
  }
  async function loadMovie(movieId, movieName) {
    await fetchAndRenderMovieDetails({ movieId, movieName, addBreadcrumb: true });
  }
  async function reloadMovie(breadcrumb) {
    await fetchAndRenderMovieDetails({
      movieId: breadcrumb.id,
      movieName: breadcrumb.name,
      addBreadcrumb: false
    });
  }
  async function selectSeriesSeason(seasonId) {
    const view = currentSeriesView;
    if (!view || !view.seasons.some((season) => season.Id === seasonId)) {
      return;
    }
    await loadSeriesSeason(view, seasonId, window.scrollY, false);
  }
  async function retrySelectedSeriesSeason() {
    const view = currentSeriesView;
    if (!view?.selectedSeasonId) {
      return;
    }
    await loadSeriesSeason(view, view.selectedSeasonId, window.scrollY, true);
  }
  async function performSearch(query) {
    const requestId = beginViewRequest();
    sidebarStore.setRetryOperation({ kind: "search", query });
    updateTitle("Search Results");
    showLoading("search");
    window.scrollTo(0, 0);
    try {
      const items = await sidebarRequests.search.search(state.userId, query);
      if (!viewRequests.isCurrent(requestId) || state.searchQuery !== query) {
        return;
      }
      hideLoading();
      if (items.length === 0) {
        renderEmptyState("No results found");
        return;
      }
      renderSearchResults(items);
    } catch (error) {
      if (!viewRequests.isCurrent(requestId) || state.searchQuery !== query) {
        return;
      }
      showError(error instanceof Error ? error.message : "Failed to search");
    }
  }

  // src/sidebar/controllers/navigation.ts
  var searchTimer = null;
  function updateSearchState(query) {
    sidebarStore.updateSearch(query);
    ui.clearSearchButton.classList.toggle("hidden", !query);
  }
  function resetSearchState(shouldReload = true) {
    cancelScheduledSearch();
    ui.searchInput.value = "";
    sidebarStore.clearSearch();
    ui.clearSearchButton.classList.add("hidden");
    setSearchFilterSelection("all");
    if (shouldReload) {
      const route = getCurrentRoute(state.router);
      if (route.kind === "library" && state.currentLibrary) {
        reloadItems(route);
        return;
      }
      state.currentLibrary = null;
      state.currentSeries = null;
      loadHome();
    }
  }
  function handleBack() {
    const current = getCurrentRoute(state.router);
    if (current.kind === "home") {
      return;
    }
    if (current.kind === "library") {
      saveCurrentLibraryScrollPosition();
    }
    const previous = sidebarStore.back();
    if (previous.kind === "home") {
      state.currentLibrary = null;
      state.currentSeries = null;
      resetSearchState(false);
      loadHome();
      return;
    }
    if (previous.kind === "search") {
      performSearch(previous.query);
      return;
    }
    switch (previous.kind) {
      case "library":
        state.currentSeries = null;
        reloadItems(previous);
        break;
      case "movie":
        reloadMovie(previous);
        break;
      case "series":
        reloadSeriesDetails(previous);
        break;
    }
  }
  function handleRetry() {
    const operation = state.retryOperation;
    switch (operation?.kind) {
      case "home":
        loadHome(operation.forceReload);
        break;
      case "library":
        reloadItems(operation);
        break;
      case "movie":
        reloadMovie(operation);
        break;
      case "series":
        reloadSeriesDetails(operation);
        break;
      case "search":
        performSearch(operation.query);
        break;
    }
  }
  function goHomeFresh(reason = "") {
    cancelScheduledSearch();
    sidebarStore.navigateHome();
    state.currentLibrary = null;
    state.currentSeries = null;
    sidebarStore.setRetryOperation(null);
    resetSearchState(false);
    if (reason) {
      log("Returning home:", reason);
    }
    loadHome();
  }
  function handleSearchInput(event) {
    const value = event.target.value;
    const query = normalizeQuery(value);
    updateSearchState(query);
    if (!query) {
      resetSearchState(true);
      return;
    }
    prepareBrowseContextForSearch();
    cancelScheduledSearch();
    searchTimer = setTimeout(() => {
      searchTimer = null;
      performSearch(query);
    }, 280);
  }
  function handleClearSearch() {
    resetSearchState(true);
  }
  function handleSearchSubmit(event) {
    event.preventDefault();
    cancelScheduledSearch();
    const query = normalizeQuery(ui.searchInput.value);
    updateSearchState(query);
    if (!query) {
      resetSearchState(true);
      return;
    }
    prepareBrowseContextForSearch();
    performSearch(query);
  }
  function prepareBrowseContextForSearch() {
    if (getCurrentRoute(state.router).kind === "search") {
      return;
    }
    cancelPendingViewRequest();
    const current = getCurrentBrowseRoute(state.router);
    if (current.kind === "library" && state.currentLibrary) {
      saveCurrentLibraryScrollPosition();
      const filter = state.currentLibrary.type === "movies" ? "movie" : "series";
      sidebarStore.beginSearch(state.searchQuery, filter);
      setSearchFilterSelection(filter);
      return;
    }
    sidebarStore.beginSearch(state.searchQuery, "all");
    state.currentLibrary = null;
    state.currentSeries = null;
  }
  function setSearchFilterSelection(filter) {
    sidebarStore.setSearchFilter(filter);
    ui.searchFilters.querySelectorAll("[data-search-filter]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.searchFilter === filter));
    });
  }
  function updateSearchFilterRoute(filter) {
    sidebarStore.setSearchFilter(filter);
  }
  function cancelScheduledSearch() {
    if (searchTimer !== null) {
      clearTimeout(searchTimer);
      searchTimer = null;
    }
  }

  // src/sidebar/controllers/session.ts
  function normalizeAndValidateUrl(rawUrl) {
    const normalizedUrl = normalizeServerUrl(rawUrl);
    if (!normalizedUrl) {
      ui.loginError.textContent = "Please enter a server URL.";
      return null;
    }
    if (!isHttpsUrl(normalizedUrl)) {
      ui.loginError.textContent = "Jellyfin requires an https:// server URL.";
      return null;
    }
    return normalizedUrl;
  }
  function restoreSessionFromStorage() {
    const savedSession = loadSessionFromStorage();
    if (!savedSession) {
      sendAuthCleared();
      showLoginView();
      return false;
    }
    const normalizedUrl = normalizeServerUrl(savedSession.serverUrl);
    if (!normalizedUrl || !isHttpsUrl(normalizedUrl)) {
      clearSessionFromStorage();
      sendAuthCleared();
      showLoginView();
      return false;
    }
    sidebarStore.patch({
      serverUrl: normalizedUrl,
      accessToken: savedSession.accessToken,
      userId: savedSession.userId,
      username: savedSession.username,
      serverName: savedSession.serverName || getServerHost(normalizedUrl)
    });
    showBrowseView();
    resetSearchState(false);
    sendAuthUpdated();
    return true;
  }
  async function handleLogin(event) {
    event.preventDefault();
    const serverUrlInput = ui.serverUrlInput.value.trim();
    const username = ui.usernameInput.value.trim();
    const password = ui.passwordInput.value;
    ui.connectBtn.disabled = true;
    ui.connectBtn.textContent = "Connecting...";
    ui.loginError.textContent = "";
    const normalizedUrl = normalizeAndValidateUrl(serverUrlInput);
    if (!normalizedUrl) {
      ui.connectBtn.disabled = false;
      ui.connectBtn.textContent = "Connect";
      return;
    }
    try {
      const authData = await authenticateUser(normalizedUrl, username, password);
      sidebarStore.patch({
        serverUrl: normalizedUrl,
        accessToken: authData.AccessToken || "",
        userId: authData.User?.Id || "",
        username: authData.User?.Name || ""
      });
      const serverDisplayName = await fetchServerName();
      const serverHostValue = getServerHost(state.serverUrl);
      sidebarStore.patch({ serverName: serverDisplayName || serverHostValue });
      saveSessionToStorage({
        serverUrl: state.serverUrl,
        serverName: state.serverName,
        accessToken: state.accessToken,
        userId: state.userId,
        username: state.username
      });
      ui.connectBtn.disabled = false;
      ui.connectBtn.textContent = "Connect";
      showBrowseView();
      resetSearchState(false);
      sendAuthUpdated();
      goHomeFresh("login");
    } catch (error) {
      ui.connectBtn.disabled = false;
      ui.connectBtn.textContent = "Connect";
      const message = error instanceof Error ? error.message : "Connection failed";
      ui.loginError.textContent = message || "Connection failed";
    }
  }
  function handleAuthenticationFailure() {
    const serverUrl = state.serverUrl;
    const username = state.username;
    clearActiveSession();
    ui.serverUrlInput.value = serverUrl;
    ui.usernameInput.value = username;
    ui.passwordInput.value = "";
    ui.loginError.textContent = "Your Jellyfin session expired. Sign in again.";
    showLoginView();
  }
  function clearActiveSession() {
    clearBackdropContext();
    clearSidebarRequestCaches();
    sidebarStore.navigateHome();
    sidebarStore.patch({
      serverUrl: "",
      serverName: "",
      accessToken: "",
      userId: "",
      username: "",
      currentLibrary: null,
      currentSeries: null,
      retryOperation: null
    });
    clearSessionFromStorage();
    sendAuthCleared();
  }
  function sendAuthUpdated() {
    if (!state.serverUrl || !state.accessToken || !state.userId) {
      return;
    }
    iina.postMessage(MESSAGE_NAMES.AuthUpdated, {
      serverUrl: state.serverUrl,
      accessToken: state.accessToken,
      userId: state.userId,
      username: state.username,
      deviceId: state.deviceId,
      serverName: state.serverName
    });
  }
  function sendAuthCleared() {
    iina.postMessage(MESSAGE_NAMES.AuthCleared, {});
  }

  // src/sidebar/selection.ts
  function resolveCardSelection(context) {
    if (context.type === "Series") {
      return "open-series";
    }
    if (context.type === "Movie" && !context.directPlay) {
      return "open-movie";
    }
    return "play";
  }

  // src/sidebar/controllers/events.ts
  var scrollStateObserver = null;
  var backdropInteractionListenersInstalled = false;
  var NAVIGATION_ELEVATION_DISTANCE = 24;
  function setupEventListeners() {
    setupNavigationScrollState();
    setupBackdropInteractionListeners();
    setupSeasonMenu((seasonId) => void selectSeriesSeason(seasonId));
    ui.loginForm.addEventListener("submit", handleLogin);
    ui.backBtn.addEventListener("click", handleBack);
    ui.retryBtn.addEventListener("click", handleRetry);
    ui.searchFilters.addEventListener("click", handleSearchFilterClick);
    ui.searchInput.addEventListener("input", handleSearchInput);
    ui.searchInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        handleSearchSubmit(event);
      } else if (event.key === "Escape") {
        event.preventDefault();
        handleClearSearch();
      }
    });
    ui.clearSearchButton.addEventListener("click", handleClearSearch);
    ui.content.addEventListener("click", handleContentClick);
    ui.content.addEventListener("keydown", handleContentKeydown);
    ui.content.addEventListener("error", handleContentError, true);
  }
  function setupBackdropInteractionListeners() {
    if (backdropInteractionListenersInstalled) {
      return;
    }
    backdropInteractionListenersInstalled = true;
    ui.content.addEventListener("pointerover", handleContentPointerOver);
    ui.content.addEventListener("pointerout", handleContentPointerOut);
    ui.content.addEventListener("focusin", handleContentFocusIn);
    ui.content.addEventListener("focusout", handleContentFocusOut);
  }
  function handleContentPointerOut(event) {
    const card = findListCard(event.target);
    const nextCard = findListCard(event.relatedTarget);
    if (card && card !== nextCard) {
      setHoveredBackdropCard(nextCard);
    }
  }
  function handleContentPointerOver(event) {
    const card = findListCard(event.target);
    const previousCard = findListCard(event.relatedTarget);
    if (!card || card === previousCard || !ui.content.contains(card)) {
      return;
    }
    setHoveredBackdropCard(card);
  }
  function handleContentFocusIn(event) {
    const card = findListCard(event.target);
    if (!card || !ui.content.contains(card)) {
      return;
    }
    setFocusedBackdropCard(card);
  }
  function handleContentFocusOut(event) {
    const card = findListCard(event.target);
    const nextCard = findListCard(event.relatedTarget);
    if (card && card !== nextCard) {
      setFocusedBackdropCard(nextCard);
    }
  }
  function setupNavigationScrollState() {
    if (scrollStateObserver) {
      return;
    }
    const updateScrollState = () => {
      const navigationElevation = Math.min(Math.max(window.scrollY, 0) / NAVIGATION_ELEVATION_DISTANCE, 1);
      ui.navigationLayer.style.setProperty("--navigation-elevation", navigationElevation.toFixed(3));
      const pageOverflows = document.documentElement.scrollHeight > window.innerHeight + 1;
      const contentOverflows = ui.content.scrollHeight > ui.content.clientHeight + 1;
      const hasVerticalOverflow = pageOverflows || contentOverflows;
      ui.bottomSearchLayer.classList.toggle("bottom-search-layer--elevated", hasVerticalOverflow);
    };
    window.addEventListener("scroll", updateScrollState, { passive: true });
    window.addEventListener("resize", updateScrollState, { passive: true });
    scrollStateObserver = new ResizeObserver(updateScrollState);
    scrollStateObserver.observe(document.body);
    scrollStateObserver.observe(ui.content);
    updateScrollState();
  }
  function handleContentClick(event) {
    const target = event.target;
    if (handleDetailPlayClick(target)) {
      return;
    }
    if (target?.closest("[data-season-retry]")) {
      retrySelectedSeriesSeason();
      return;
    }
    if (handleHomeLibraryClick(target)) {
      return;
    }
    const card = findListCard(event.target);
    if (!card || !ui.content.contains(card)) {
      return;
    }
    handleListCardSelection(card);
  }
  function handleDetailPlayClick(target) {
    const button = target?.closest("[data-detail-play]");
    if (!button) {
      return false;
    }
    const id = button.dataset.id || "";
    if (id) {
      playItem(id, button.dataset.name || "Video", Number.parseInt(button.dataset.resume || "0", 10) || 0, getDetailPlaybackContext(button));
    }
    return true;
  }
  function getDetailPlaybackContext(button) {
    return {
      seriesId: button.dataset.seriesId || "",
      seasonId: button.dataset.seasonId || "",
      episodeIndex: button.dataset.episodeIndex ? Number.parseInt(button.dataset.episodeIndex, 10) : null
    };
  }
  function handleHomeLibraryClick(target) {
    const link = target?.closest("[data-home-library]");
    if (!link) {
      return false;
    }
    loadItems("", link.dataset.homeLibraryName || "Library", link.dataset.homeLibrary || "");
    return true;
  }
  function handleSearchFilterClick(event) {
    const button = event.target?.closest("[data-search-filter]");
    const filter = button?.dataset.searchFilter;
    if (isSearchFilter(filter)) {
      updateSearchFilterRoute(filter);
      setSearchFilter(filter);
    }
  }
  function isSearchFilter(value) {
    return value === "all" || value === "movie" || value === "series" || value === "episode";
  }
  function handleContentKeydown(event) {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }
    const card = findListCard(event.target);
    if (!card || !ui.content.contains(card)) {
      return;
    }
    event.preventDefault();
    handleListCardSelection(card);
  }
  function handleListCardSelection(card) {
    const details = getCardContext(card);
    if (!details || !details.id) {
      return;
    }
    const { id, name, resume, context } = details;
    const action = resolveCardSelection(details);
    if (action === "play") {
      playItem(id, name, resume, context);
      return;
    }
    prepareForDetailsNavigation();
    if (action === "open-movie") {
      loadMovie(id, name);
      return;
    }
    loadSeriesDetails(id, name);
  }
  function prepareForDetailsNavigation() {
    if (state.searchQuery) {
      resetSearchState(false);
      return;
    }
    saveCurrentLibraryScrollPosition();
  }

  // src/sidebar/controllers/bootstrap.ts
  function applySidebarPreferences(payload) {
    const backdropPreviewsEnabled = payload?.backdropPreviewsEnabled !== false;
    const preferEpisodeImagesInNextUp = Boolean(payload?.preferEpisodeImagesInNextUp);
    sidebarStore.patch({ backdropPreviewsEnabled, preferEpisodeImagesInNextUp });
  }
  function initSidebar() {
    let sidebarReady = false;
    let pendingSidebarRefresh = false;
    setAuthenticationFailureHandler(handleAuthenticationFailure);
    iina.onMessage(MESSAGE_NAMES.SidebarPreferences, (payload) => {
      applySidebarPreferences(payload);
    });
    iina.onMessage(MESSAGE_NAMES.RefreshSidebar, () => {
      if (!sidebarReady) {
        pendingSidebarRefresh = true;
        return;
      }
      if (!state.accessToken || !state.userId) {
        return;
      }
      pendingSidebarRefresh = false;
      goHomeFresh("refreshSidebar");
    });
    document.addEventListener("DOMContentLoaded", () => {
      setupEventListeners();
      sidebarStore.patch({ deviceId: getDeviceId() });
      const restored = restoreSessionFromStorage();
      if (restored) {
        goHomeFresh("session-restore");
      }
      sidebarReady = true;
      if (pendingSidebarRefresh) {
        if (state.accessToken && state.userId) {
          goHomeFresh("pending");
        }
        pendingSidebarRefresh = false;
      }
    });
  }

  // src/sidebar/runtime.ts
  function startSidebar() {
    document.addEventListener("visibilitychange", () => {
      iina.postMessage(MESSAGE_NAMES.SidebarVisibilityChanged, {
        visible: !document.hidden
      });
    });
    initSidebar();
  }

  // src/entries/sidebar.ts
  startSidebar();
})();
