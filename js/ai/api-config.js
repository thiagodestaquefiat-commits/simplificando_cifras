(function (global) {
  "use strict";

  function configuredBaseUrl() {
    const runtime = global.SIMPLIFICANDO_CIFRAS_CONFIG && global.SIMPLIFICANDO_CIFRAS_CONFIG.API_BASE_URL;
    const meta = global.document && global.document.querySelector('meta[name="sc-api-base-url"]')?.content;
    if (runtime || meta) return String(runtime || meta).trim().replace(/\/$/, "");
    return /^(localhost|127\.0\.0\.1)$/.test(global.location?.hostname || "") ? "http://127.0.0.1:5000" : "";
  }

  function endpoint(path) {
    const suffix = String(path || "").startsWith("/") ? path : `/${path || ""}`;
    return `${configuredBaseUrl()}${suffix}`;
  }

  global.apiConfig = Object.freeze({
    get API_BASE_URL() { return configuredBaseUrl(); },
    harmonicSummaryEndpoint() { return endpoint("/api/resumo-harmonico"); }
  });
})(window);
