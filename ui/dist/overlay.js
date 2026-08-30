(() => {
  // src/jellyfin/messages.ts
  var MESSAGE_NAMES = {
    AuthUpdated: "authUpdated",
    AuthCleared: "authCleared",
    PlayItem: "playItem",
    QueueItem: "queueItem",
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
    let sidebarWidth = 0;
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
      const nextSidebarWidth = normalizeSidebarWidth(payload?.sidebarWidth);
      const backdropsUnchanged = arraysEqual(playlistUrls, nextPlaylistUrls) && overrideUrl === nextOverrideUrl && eligible === nextEligible;
      if (sidebarWidth !== nextSidebarWidth) {
        sidebarWidth = nextSidebarWidth;
        options.view.setSidebarWidth(sidebarWidth);
      }
      if (backdropsUnchanged) {
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
  function normalizeSidebarWidth(width) {
    return typeof width === "number" && Number.isFinite(width) ? Math.max(0, width) : 0;
  }

  // src/overlay/color.ts
  function averagePixelColor(pixels) {
    let red = 0;
    let green = 0;
    let blue = 0;
    let alphaTotal = 0;
    for (let index = 0;index + 3 < pixels.length; index += 4) {
      const alpha = pixels[index + 3] / 255;
      red += pixels[index] * alpha;
      green += pixels[index + 1] * alpha;
      blue += pixels[index + 2] * alpha;
      alphaTotal += alpha;
    }
    if (alphaTotal === 0) {
      return null;
    }
    return {
      red: Math.round(red / alphaTotal),
      green: Math.round(green / alphaTotal),
      blue: Math.round(blue / alphaTotal)
    };
  }
  function toCssColor(color) {
    return `rgb(${color.red}, ${color.green}, ${color.blue})`;
  }

  // src/overlay/layout.ts
  var CROPPED_BACKDROP_ASPECT_RATIO = 352 / 225;
  function calculateBackdropLayout(viewportWidth, viewportHeight, requestedSidebarWidth) {
    const width = Math.max(0, viewportWidth);
    const height = Math.max(0, viewportHeight);
    const sidebarWidth = Math.min(Math.max(0, requestedSidebarWidth), width);
    const availableWidth = Math.max(1, width - sidebarWidth);
    const availableHeight = Math.max(1, height);
    return {
      imageWidth: Math.min(availableWidth, availableHeight * CROPPED_BACKDROP_ASPECT_RATIO),
      sidebarWidth
    };
  }

  // src/overlay/domView.ts
  var DEFAULT_BACKDROP_COLOR = "rgb(16, 16, 16)";
  var SAMPLE_WIDTH = 32;
  var SAMPLE_HEIGHT = 18;
  function createOverlayDomView(document2) {
    const backdrop = getRequiredElement(document2, "backdrop-preview");
    const layers = Array.from(document2.querySelectorAll(".backdrop-layer"));
    const skipButton = getRequiredElement(document2, "skip-button");
    if (layers.length !== 2) {
      throw new Error(`Expected two backdrop image layers, found ${layers.length}`);
    }
    let activeLayerIndex = 0;
    let displayedUrl = "";
    let sidebarWidth = 0;
    const averageColors = new Map;
    const updateBackdropLayout = () => applyBackdropLayout(document2, backdrop, sidebarWidth);
    document2.defaultView?.addEventListener("resize", updateBackdropLayout, { passive: true });
    updateBackdropLayout();
    return {
      hideBackdrop: () => backdrop.classList.remove("visible"),
      loadBackdrop(url, onLoad, onError) {
        const activeImage = getLayerImage(layers[activeLayerIndex], ".backdrop-image");
        if (displayedUrl === url && activeImage.complete && Boolean(activeImage.naturalWidth)) {
          onLoad({ display: () => {
            return;
          } });
          return;
        }
        const nextLayerIndex = activeLayerIndex === 0 ? 1 : 0;
        const nextLayer = layers[nextLayerIndex];
        const nextImage = getLayerImage(nextLayer, ".backdrop-image");
        const ambientImage = getLayerImage(nextLayer, ".backdrop-ambient");
        nextLayer.classList.remove("active");
        ambientImage.src = url;
        loadImageForSampling(nextImage, url, () => {
          const color = averageColors.get(url) || sampleAverageColor(document2, nextImage);
          if (color) {
            averageColors.set(url, color);
          }
          onLoad(createLoadedBackdrop(url, nextLayerIndex, color || DEFAULT_BACKDROP_COLOR));
        }, onError);
      },
      onSkipRequested(handler) {
        skipButton.addEventListener("click", handler);
      },
      preloadBackdrop(url) {
        const image = new Image;
        image.src = url;
      },
      setBackdropVisible: () => backdrop.classList.add("visible"),
      setSidebarWidth(width) {
        sidebarWidth = Math.max(0, width);
        updateBackdropLayout();
      },
      setSkipButton(label) {
        skipButton.textContent = label;
        skipButton.classList.toggle("hidden", !label);
      }
    };
    function createLoadedBackdrop(url, layerIndex, color) {
      return {
        display() {
          layers[activeLayerIndex].classList.remove("active");
          layers[layerIndex].style.setProperty("--backdrop-color", color);
          layers[layerIndex].classList.add("active");
          activeLayerIndex = layerIndex;
          displayedUrl = url;
        }
      };
    }
  }
  function applyBackdropLayout(document2, backdrop, requestedSidebarWidth) {
    const viewportWidth = document2.documentElement.clientWidth;
    const viewportHeight = document2.documentElement.clientHeight;
    const layout = calculateBackdropLayout(viewportWidth, viewportHeight, requestedSidebarWidth);
    backdrop.style.setProperty("--sidebar-width", `${layout.sidebarWidth}px`);
    backdrop.style.setProperty("--backdrop-width", `${layout.imageWidth}px`);
  }
  function getLayerImage(layer, selector) {
    const image = layer.querySelector(selector);
    if (!image) {
      throw new Error(`Missing overlay image ${selector}`);
    }
    return image;
  }
  function loadImageForSampling(image, url, onLoad, onError) {
    image.onload = onLoad;
    image.onerror = () => {
      if (image.crossOrigin !== null) {
        image.crossOrigin = null;
        image.onerror = onError;
        image.src = url;
        return;
      }
      onError();
    };
    image.crossOrigin = "anonymous";
    image.src = url;
  }
  function sampleAverageColor(document2, image) {
    try {
      const canvas = document2.createElement("canvas");
      canvas.width = SAMPLE_WIDTH;
      canvas.height = SAMPLE_HEIGHT;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) {
        return null;
      }
      context.drawImage(image, 0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT);
      const color = averagePixelColor(context.getImageData(0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT).data);
      return color ? toCssColor(color) : null;
    } catch {
      return null;
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
