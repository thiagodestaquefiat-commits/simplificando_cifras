(function (global) {
  "use strict";

  let mapConfigPromise = null;

  function endpoint(path) {
    return global.apiConfig && global.apiConfig.locationEndpoint ? global.apiConfig.locationEndpoint(path) : "";
  }

  function normalize(value) {
    return global.eventModel.create({ eventLocation: value }).eventLocation;
  }

  async function search(query, options) {
    const text = String(query || "").trim();
    if (text.length < 4) return [];
    const response = await global.fetch(endpoint("/search?q=" + encodeURIComponent(text)), { signal: options && options.signal, headers: { Accept: "application/json" } });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(body && body.erro && body.erro.mensagem || "Não foi possível buscar endereços agora.");
    return (body && Array.isArray(body.results) ? body.results : []).map(normalize).filter(Boolean).slice(0, 5);
  }

  function mapUrl(location, dimensions) {
    const value = normalize(location);
    if (!value) return "";
    const size = dimensions || {};
    const query = new URLSearchParams({ latitude: value.latitude, longitude: value.longitude, width: size.width || 720, height: size.height || 320 });
    return endpoint("/map?" + query.toString());
  }

  function externalMapUrl(location) {
    const value = normalize(location);
    const query = value ? value.latitude + "," + value.longitude : String(location && location.formattedAddress || "").trim();
    return query ? "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(query) : "";
  }

  async function interactiveMapConfig() {
    if (mapConfigPromise) return mapConfigPromise;
    mapConfigPromise = (async () => {
      try {
        const response = await global.fetch(endpoint("/config"), { headers: { Accept: "application/json" } });
        const body = await response.json().catch(() => null);
        const styleUrl = String(body && body.styleUrl || "").trim();
        const enabled = Boolean(response.ok && body && body.interactiveEnabled && /^https:\/\/maps\.geoapify\.com\//.test(styleUrl));
        return { enabled, provider: "geoapify", styleUrl: enabled ? styleUrl : "" };
      } catch (_error) {
        return { enabled: false, provider: "geoapify", styleUrl: "" };
      }
    })();
    return mapConfigPromise;
  }

  global.locationService = Object.freeze({ search, mapUrl, externalMapUrl, interactiveMapConfig, normalize });
})(window);
