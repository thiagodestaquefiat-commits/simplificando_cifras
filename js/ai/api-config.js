(function (global) {
  "use strict";

  function configuredBaseUrl() {
    const runtime = global.SIMPLIFICANDO_CIFRAS_CONFIG && global.SIMPLIFICANDO_CIFRAS_CONFIG.API_BASE_URL;
    const meta = global.document && global.document.querySelector('meta[name="sc-api-base-url"]')?.content;
    const hostname = String(global.location?.hostname || "");
    const preview = hostname.match(/^deploy-preview-(\d+)--simplificandocifras\.netlify\.app$/);
    if (runtime) return String(runtime).trim().replace(/\/$/, "");
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
    authEndpoint(path) { return endpoint("/api/auth" + (String(path || "").startsWith("/") ? path : "/" + String(path || ""))); },
    locationEndpoint(path) { return endpoint("/api/locations" + (String(path || "").startsWith("/") ? path : "/" + String(path || ""))); },
    collaborationEndpoint(path) { return endpoint("/api/collaboration" + (String(path || "").startsWith("/") ? path : "/" + String(path || ""))); }
  });
})(window);
