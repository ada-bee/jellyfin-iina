(() => {
  // src/shared/constants.ts
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
  // src/adapters/iina/utils.ts
  function logDebug(...args) {
    if (DEBUG_LOGS) {
      iina.console.log(...args);
    }
  }

  // src/entries/global.ts
  logDebug("Jellyfin: Global entry loaded");
})();
