(function (global) {
  "use strict";

  function baseUrl() {
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
    return `${baseUrl()}/api/youtube${path}`;
  }

  async function parseResponse(response) {
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = payload?.erro?.mensagem || `A busca do YouTube falhou (HTTP ${response.status}).`;
      const error = new Error(message);
      error.status = response.status;
      error.code = payload?.erro?.codigo || null;
      throw error;
    }
    return payload;
  }

  async function getConfig() {
    const response = await global.fetch(endpoint("/config"), { headers: { Accept: "application/json" } });
    return parseResponse(response);
  }

  async function searchVideos(query, limit, options) {
    const cleaned = String(query || "").trim();
    if (cleaned.length < 3) return [];
    const parameters = new URLSearchParams({
      q: cleaned,
      limit: String(Math.min(Math.max(Number(limit) || 8, 1), 10))
    });
    const response = await global.fetch(endpoint("/search?") + parameters.toString(), {
      headers: { Accept: "application/json" },
      signal: options && options.signal
    });
    const payload = await parseResponse(response);
    return Array.isArray(payload.videos) ? payload.videos.map((video) => ({
      title: String(video.title || "").trim(),
      artist: String(video.channelTitle || "").trim(),
      youtubeChannelTitle: String(video.channelTitle || "").trim(),
      youtubeVideoId: String(video.videoId || "").trim(),
      youtubeUrl: String(video.youtubeUrl || "").trim(),
      coverUrl: String(video.thumbnailUrl || "").trim() || null,
      publishedAt: video.publishedAt || null,
      key: "",
      capo: "",
      blocos: []
    })).filter((video) => video.title && video.youtubeVideoId) : [];
  }

  global.youtubeApi = Object.freeze({ getConfig, searchVideos });
})(window);
