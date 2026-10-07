(function (global) {
  "use strict";

  function usesProductionApi() {
    const key = "roudy_preview_api";
    try {
      const value = new URLSearchParams(global.location?.search || "").get("api");
      if (value === "producao") global.sessionStorage?.setItem(key, "producao");
      if (value === "pr") global.sessionStorage?.removeItem(key);
      return global.sessionStorage?.getItem(key) === "producao";
    } catch (_) { return false; }
  }

  function configuredBaseUrl() {
    const runtime = global.SIMPLIFICANDO_CIFRAS_CONFIG && global.SIMPLIFICANDO_CIFRAS_CONFIG.API_BASE_URL;
    const meta = global.document && global.document.querySelector('meta[name="sc-api-base-url"]')?.content;
    const hostname = String(global.location?.hostname || "");
    const preview = hostname.match(/^deploy-preview-(\d+)--simplificandocifras\.netlify\.app$/);
    if (runtime) return String(runtime).trim().replace(/\/$/, "");
    // PR só de app (sem backend próprio no Railway): abra o preview com ?api=producao.
    // Só aceita o valor fixo "producao" e usa a URL da meta tag, nunca um endereço vindo da URL.
    if (preview && meta && usesProductionApi()) return String(meta).trim().replace(/\/$/, "");
    if (preview) return `https://simplificandocifras-simplificandocifras-pr-${preview[1]}.up.railway.app`;
    if (meta) return String(meta).trim().replace(/\/$/, "");
    return /^(localhost|127\.0\.0\.1)$/.test(hostname) ? "http://127.0.0.1:5000" : "";
  }

  function endpoint(path) {
    const suffix = String(path || "").startsWith("/") ? path : `/${path || ""}`;
    return `${configuredBaseUrl()}${suffix}`;
  }

  global.apiConfig = Object.freeze({
    get API_BASE_URL() { return configuredBaseUrl(); },
    harmonicSummaryEndpoint() { return endpoint("/api/resumo-harmonico"); },
    sharedSongsEndpoint(path) { return endpoint("/api/shared-songs/" + String(path || "").replace(/^\//, "")); },
    musicSourceEndpoint(path) { return endpoint("/api/music-sources" + (String(path || "").startsWith("/") ? path : "/" + String(path || ""))); },
    authEndpoint(path) { return endpoint("/api/auth" + (String(path || "").startsWith("/") ? path : "/" + String(path || ""))); },
    locationEndpoint(path) { return endpoint("/api/locations" + (String(path || "").startsWith("/") ? path : "/" + String(path || ""))); },
    collaborationEndpoint(path) { return endpoint("/api/collaboration" + (String(path || "").startsWith("/") ? path : "/" + String(path || ""))); },
    libraryEndpoint(path) { return endpoint("/api/library/songs" + (String(path || "").startsWith("/") ? path : path ? "/" + String(path) : "")); }
  });
})(window);
