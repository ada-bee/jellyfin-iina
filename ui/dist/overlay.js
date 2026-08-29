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

  // src/overlay/controller.ts
  var DEFAULT_SLIDESHOW_INTERVAL_MS = 8000;
  function createOverlayController(options) {
    const intervalMs = options.slideshowIntervalMs ?? DEFAULT_SLIDESHOW_INTERVAL_MS;
    let playlistUrls = [];
    let overrideUrl = "";
    let eligible = false;
    let currentPlaylistIndex = -1;
    let loadGeneration = 0;
    let slideshowTimer = null;
    let skipLabel = "";
    function clearSlideshowTimer() {
      if (slideshowTimer === null) {
        return;
      }
      options.scheduler.clearTimeout(slideshowTimer);
      slideshowTimer = null;
    }
    function preloadNextImage(index) {
      if (playlistUrls.length < 2) {
        return;
      }
      options.view.preloadBackdrop(playlistUrls[(index + 1) % playlistUrls.length]);
    }
    function scheduleNextImage() {
      clearSlideshowTimer();
      if (!eligible || overrideUrl || playlistUrls.length < 2) {
        return;
      }
      slideshowTimer = options.scheduler.setTimeout(() => {
        slideshowTimer = null;
        const nextIndex = (Math.max(currentPlaylistIndex, 0) + 1) % playlistUrls.length;
        showPlaylistImage(nextIndex, playlistUrls.length);
      }, intervalMs);
    }
    function showUrl(url, onLoad, onError) {
      const generation = ++loadGeneration;
      options.view.loadBackdrop(url, (backdrop) => {
        if (generation !== loadGeneration || !eligible) {
          return;
        }
        backdrop.display();
        options.view.setBackdropVisible();
        onLoad();
      }, () => {
        if (generation !== loadGeneration || !eligible) {
          return;
        }
        onError();
      });
    }
    function showPlaylistImage(index, attemptsRemaining, allowDuringOverride = false) {
      if (!eligible || playlistUrls.length === 0 || attemptsRemaining <= 0 || overrideUrl && !allowDuringOverride) {
        if (attemptsRemaining <= 0) {
          options.view.hideBackdrop();
        }
        return;
      }
      const normalizedIndex = index % playlistUrls.length;
      showUrl(playlistUrls[normalizedIndex], () => {
        currentPlaylistIndex = normalizedIndex;
        preloadNextImage(normalizedIndex);
        scheduleNextImage();
      }, () => showPlaylistImage((normalizedIndex + 1) % playlistUrls.length, attemptsRemaining - 1, allowDuringOverride));
    }
    function showOverride() {
      clearSlideshowTimer();
      showUrl(overrideUrl, () => {
        return;
      }, () => {
        if (playlistUrls.length === 0) {
          options.view.hideBackdrop();
          return;
        }
        showPlaylistImage(currentPlaylistIndex >= 0 ? currentPlaylistIndex : 0, playlistUrls.length, true);
      });
    }
    function setBackdrops(payload) {
      const nextPlaylistUrls = Array.from(new Set((payload?.playlistUrls || []).filter(Boolean)));
      const nextOverrideUrl = payload?.overrideUrl || "";
      const nextEligible = Boolean(payload?.eligible);
      if (arraysEqual(playlistUrls, nextPlaylistUrls) && overrideUrl === nextOverrideUrl && eligible === nextEligible) {
        return;
      }
      const currentPlaylistUrl = currentPlaylistIndex >= 0 ? playlistUrls[currentPlaylistIndex] : "";
      const playlistChanged = !arraysEqual(playlistUrls, nextPlaylistUrls);
      const overrideEnded = Boolean(overrideUrl) && !nextOverrideUrl;
      playlistUrls = nextPlaylistUrls;
      overrideUrl = nextOverrideUrl;
      eligible = nextEligible;
      if (playlistChanged) {
        currentPlaylistIndex = currentPlaylistUrl ? playlistUrls.indexOf(currentPlaylistUrl) : -1;
      }
      clearSlideshowTimer();
      loadGeneration += 1;
      if (!eligible) {
        options.view.hideBackdrop();
        return;
      }
      if (overrideUrl) {
        showOverride();
        return;
      }
      if (playlistUrls.length > 0) {
        showPlaylistImage(resolvePlaylistIndex(currentPlaylistIndex, playlistUrls.length, overrideEnded), playlistUrls.length);
        return;
      }
      options.view.hideBackdrop();
    }
    function setSkipButton(payload) {
      const nextLabel = payload?.label || "";
      if (skipLabel === nextLabel) {
        return;
      }
      skipLabel = nextLabel;
      options.view.setSkipButton(skipLabel);
    }
    return {
      requestSkip: options.onSkipRequested,
      setBackdrops,
      setSkipButton
    };
  }
  function arraysEqual(left, right) {
    return left.length === right.length && left.every((value, index) => value === right[index]);
  }
  function resolvePlaylistIndex(currentIndex, playlistLength, advance) {
    if (playlistLength <= 0 || currentIndex < 0) {
      return 0;
    }
    return advance ? (currentIndex + 1) % playlistLength : currentIndex;
  }

  // src/overlay/domView.ts
  function createOverlayDomView(document2) {
    const backdrop = getRequiredElement(document2, "backdrop-preview");
    const layers = Array.from(document2.querySelectorAll(".backdrop-image"));
    const skipButton = getRequiredElement(document2, "skip-button");
    if (layers.length !== 2) {
      throw new Error(`Expected two backdrop image layers, found ${layers.length}`);
    }
    let activeLayerIndex = 0;
    let displayedUrl = "";
    return {
      hideBackdrop: () => backdrop.classList.remove("visible"),
      loadBackdrop(url, onLoad, onError) {
        const activeLayer = layers[activeLayerIndex];
        if (displayedUrl === url && activeLayer.complete && Boolean(activeLayer.naturalWidth)) {
          onLoad({ display: () => {
            return;
          } });
          return;
        }
        const nextLayerIndex = activeLayerIndex === 0 ? 1 : 0;
        const nextLayer = layers[nextLayerIndex];
        nextLayer.onload = () => {
          onLoad(createLoadedBackdrop(url, nextLayerIndex));
        };
        nextLayer.onerror = onError;
        nextLayer.classList.remove("active");
        nextLayer.src = url;
      },
      onSkipRequested(handler) {
        skipButton.addEventListener("click", handler);
      },
      preloadBackdrop(url) {
        const image = new Image;
        image.src = url;
      },
      setBackdropVisible: () => backdrop.classList.add("visible"),
      setSkipButton(label) {
        skipButton.textContent = label;
        skipButton.classList.toggle("hidden", !label);
      }
    };
    function createLoadedBackdrop(url, layerIndex) {
      return {
        display() {
          layers[activeLayerIndex].classList.remove("active");
          layers[layerIndex].classList.add("active");
          activeLayerIndex = layerIndex;
          displayedUrl = url;
        }
      };
    }
  }
  function getRequiredElement(document2, id) {
    const element = document2.getElementById(id);
    if (!element) {
      throw new Error(`Missing overlay element #${id}`);
    }
    return element;
  }

  // src/overlay/runtime.ts
  function startOverlay() {
    const view = createOverlayDomView(document);
    const scheduler = {
      setTimeout: (callback, delayMs) => window.setTimeout(callback, delayMs),
      clearTimeout: (handle) => window.clearTimeout(handle)
    };
    const controller = createOverlayController({
      view,
      scheduler,
      onSkipRequested: () => iina.postMessage(MESSAGE_NAMES.SkipSegment, {})
    });
    view.onSkipRequested(controller.requestSkip);
    iina.onMessage(MESSAGE_NAMES.OverlayBackdrops, controller.setBackdrops);
    iina.onMessage(MESSAGE_NAMES.OverlaySkipButton, controller.setSkipButton);
  }

  // src/entries/overlay.ts
  startOverlay();
})();
