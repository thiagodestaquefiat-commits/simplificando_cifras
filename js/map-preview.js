(function (global) {
  "use strict";

  const MAPLIBRE_VERSION = "6.1.0";
  const MAPLIBRE_SCRIPT = "https://unpkg.com/maplibre-gl@" + MAPLIBRE_VERSION + "/dist/maplibre-gl.js";
  const MAPLIBRE_STYLE = "https://unpkg.com/maplibre-gl@" + MAPLIBRE_VERSION + "/dist/maplibre-gl.css";
  const activeMaps = new WeakMap();
  let libraryPromise = null;

  function ensureMapLibre() {
    if (global.maplibregl) return Promise.resolve(global.maplibregl);
    if (libraryPromise) return libraryPromise;
    libraryPromise = new Promise((resolve, reject) => {
      if (!document.querySelector('link[data-sc-maplibre="true"]')) {
        const stylesheet = document.createElement("link");
        stylesheet.rel = "stylesheet";
        stylesheet.href = MAPLIBRE_STYLE;
        stylesheet.crossOrigin = "anonymous";
        stylesheet.dataset.scMaplibre = "true";
        document.head.append(stylesheet);
      }
      const stale = document.querySelector('script[data-sc-maplibre="true"]');
      if (stale) stale.remove();
      const script = document.createElement("script");
      const complete = () => global.maplibregl ? resolve(global.maplibregl) : reject(new Error("MapLibre indisponível"));
      script.addEventListener("load", complete, { once: true });
      script.addEventListener("error", () => reject(new Error("Falha ao carregar MapLibre")), { once: true });
      script.src = MAPLIBRE_SCRIPT;
      script.crossOrigin = "anonymous";
      script.dataset.scMaplibre = "true";
      document.head.append(script);
    }).catch((error) => {
      libraryPromise = null;
      throw error;
    });
    return libraryPromise;
  }

  function destroy(container) {
    const active = activeMaps.get(container);
    if (!active) return;
    if (active.observer) active.observer.disconnect();
    if (active.map && typeof active.map.remove === "function") active.map.remove();
    activeMaps.delete(container);
  }

  function render(container, location, options) {
    if (!container) return;
    destroy(container);
    const value = global.locationService.normalize(location);
    container.replaceChildren();
    container.hidden = !value;
    if (!value) return;

    const compact = Boolean(options && options.compact);
    const figure = document.createElement("figure");
    figure.className = "event-map-card" + (compact ? " compact" : "");

    const viewport = document.createElement("div");
    viewport.className = "event-map-viewport";
    const loading = document.createElement("div");
    loading.className = "event-map-loading";
    loading.textContent = "Carregando mapa…";
    const image = document.createElement("img");
    image.loading = "lazy";
    image.hidden = true;
    image.alt = "Mapa de " + (value.formattedAddress || value.name || "local do evento");
    const canvas = document.createElement("div");
    canvas.className = "event-map-canvas";
    canvas.setAttribute("aria-label", "Mapa interativo de " + (value.formattedAddress || value.name || "local do evento"));
    const recenter = document.createElement("button");
    recenter.type = "button";
    recenter.className = "event-map-recenter";
    recenter.hidden = true;
    recenter.textContent = "◎ Recentrar";
    viewport.append(loading, image, canvas, recenter);

    const caption = document.createElement("figcaption");
    const address = document.createElement("span");
    address.textContent = value.formattedAddress || value.name;
    const link = document.createElement("a");
    link.href = global.locationService.externalMapUrl(value);
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "Abrir no mapa ↗";
    const attribution = document.createElement("small");
    attribution.innerHTML = 'Mapa: <a href="https://www.geoapify.com/" target="_blank" rel="noopener noreferrer">Geoapify</a> · © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>';
    caption.append(address, link, attribution);
    figure.append(viewport, caption);
    container.append(figure);

    const isCurrent = () => container.isConnected !== false && container.contains(figure);

    let fallbackStarted = false;
    function showStaticFallback() {
      if (fallbackStarted || !isCurrent()) return;
      fallbackStarted = true;
      figure.classList.add("static-fallback");
      loading.hidden = true;
      canvas.hidden = true;
      image.hidden = false;
      image.src = global.locationService.mapUrl(value, compact ? { width: 640, height: 240 } : { width: 900, height: 360 });
      image.addEventListener("error", () => {
        image.hidden = true;
        const message = document.createElement("div");
        message.className = "event-map-error";
        message.textContent = "A prévia do mapa não está disponível agora. O endereço continua salvo.";
        viewport.append(message);
      }, { once: true });
    }

    (async () => {
      const config = await global.locationService.interactiveMapConfig();
      if (!config.enabled || !isCurrent()) return showStaticFallback();
      try {
        const maplibregl = await ensureMapLibre();
        if (!isCurrent()) return;
        const center = [value.longitude, value.latitude];
        let ready = false;
        const map = new maplibregl.Map({
          container: canvas,
          style: config.styleUrl,
          center,
          zoom: compact ? 15 : 16,
          cooperativeGestures: true,
          dragRotate: false,
          touchPitch: false,
          pitchWithRotate: false,
          attributionControl: true
        });
        map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
        new maplibregl.Marker({ color: "#22c55e" }).setLngLat(center).addTo(map);
        const observer = typeof global.ResizeObserver === "function" ? new global.ResizeObserver(() => map.resize()) : null;
        if (observer) observer.observe(viewport);
        activeMaps.set(container, { map, observer });
        recenter.addEventListener("click", () => {
          const targetZoom = compact ? 15 : 16;
          const zoom = typeof map.getZoom === "function" ? Math.max(map.getZoom(), targetZoom) : targetZoom;
          map.easeTo({ center, zoom, duration: 500 });
        });
        map.once("load", () => {
          if (!isCurrent()) return destroy(container);
          ready = true;
          loading.hidden = true;
          image.hidden = true;
          recenter.hidden = false;
          figure.classList.add("interactive-ready");
          map.resize();
        });
        map.on("error", () => {
          if (!ready) {
            destroy(container);
            showStaticFallback();
          }
        });
      } catch (_error) {
        showStaticFallback();
      }
    })();
  }

  global.eventMapPreview = Object.freeze({ render, destroy });
})(window);
