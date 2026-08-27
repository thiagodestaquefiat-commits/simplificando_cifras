(function (global) {
  "use strict";

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

  global.locationService = Object.freeze({ search, mapUrl, externalMapUrl, normalize });
})(window);
