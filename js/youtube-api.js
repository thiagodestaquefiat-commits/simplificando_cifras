(function (global) {
  "use strict";

  function baseUrl() {
    const runtime = global.SIMPLIFICANDO_CIFRAS_CONFIG && global.SIMPLIFICANDO_CIFRAS_CONFIG.API_BASE_URL;
    const meta = global.document && global.document.querySelector('meta[name="sc-api-base-url"]')?.content;
    const hostname = String(global.location?.hostname || "");
    const preview = hostname.match(/^deploy-preview-(\d+)--simplificandocifras\.netlify\.app$/);
    if (runtime) return String(runtime).trim().replace(/\/$/, "");
    if (meta) return String(meta).trim().replace(/\/$/, "");
    if (preview) return `https://simplificandocifras-simplificandocifras-pr-${preview[1]}.up.railway.app`;
    return /^(localhost|127\.0\.0\.1)$/.test(hostname) ? "http://127.0.0.1:5000" : "";
  }

  function endpoint(path) {
    return `${baseUrl()}/api/youtube${path}`;
  }

  function extractVideoId(value) {
    const cleaned = String(value || "").trim();
    if (/^[A-Za-z0-9_-]{11}$/.test(cleaned)) return cleaned;

    let url;
    try {
      url = new URL(/^https?:\/\//i.test(cleaned) ? cleaned : `https://${cleaned}`);
    } catch (_) {
      return null;
    }

    const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    let candidate = "";
    if (hostname === "youtu.be") {
      candidate = url.pathname.split("/").filter(Boolean)[0] || "";
    } else if (hostname === "youtube.com" || hostname === "m.youtube.com" || hostname === "music.youtube.com") {
      if (url.pathname === "/watch") candidate = url.searchParams.get("v") || "";
      else {
        const parts = url.pathname.split("/").filter(Boolean);
        if (["shorts", "embed", "live"].includes(parts[0])) candidate = parts[1] || "";
      }
    }

    return /^[A-Za-z0-9_-]{11}$/.test(candidate) ? candidate : null;
  }

  function mapVideo(video) {
    return {
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
    };
  }

  function fallbackVideo(videoId) {
    return {
      title: "Vídeo do YouTube",
      artist: "YouTube",
      youtubeChannelTitle: "YouTube",
      youtubeVideoId: videoId,
      youtubeUrl: `https://www.youtube.com/watch?v=${videoId}`,
      coverUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      publishedAt: null,
      key: "",
      capo: "",
      blocos: []
    };
  }

  async function videoFromLink(videoId, options) {
    const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(youtubeUrl)}&format=json`;
    try {
      const response = await global.fetch(oembedUrl, {
        headers: { Accept: "application/json" },
        signal: options && options.signal
      });
      if (!response.ok) {
        const error = new Error(response.status === 404
          ? "Esse vídeo do YouTube não foi encontrado ou não está disponível."
          : "Não foi possível consultar esse vídeo do YouTube.");
        error.status = response.status;
        throw error;
      }
      const payload = await response.json();
      return {
        title: String(payload.title || "Vídeo do YouTube").trim(),
        artist: String(payload.author_name || "YouTube").trim(),
        youtubeChannelTitle: String(payload.author_name || "YouTube").trim(),
        youtubeVideoId: videoId,
        youtubeUrl,
        coverUrl: String(payload.thumbnail_url || "").trim() || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        publishedAt: null,
        key: "",
        capo: "",
        blocos: []
      };
    } catch (error) {
      if (error?.name === "AbortError" || error?.status) throw error;
      return fallbackVideo(videoId);
    }
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
    const linkedVideoId = extractVideoId(cleaned);
    if (linkedVideoId) return [await videoFromLink(linkedVideoId, options)];
    const parameters = new URLSearchParams({
      q: cleaned,
      limit: String(Math.min(Math.max(Number(limit) || 8, 1), 10))
    });
    const response = await global.fetch(endpoint("/search?") + parameters.toString(), {
      headers: { Accept: "application/json" },
      signal: options && options.signal
    });
    const payload = await parseResponse(response);
    const videos = Array.isArray(payload.videos)
      ? payload.videos.map(mapVideo).filter((video) => video.title && video.youtubeVideoId)
      : [];
    return videos;
  }

  global.youtubeApi = Object.freeze({ getConfig, searchVideos, extractVideoId });
})(window);
