// MANUTENÇÃO: Resolve a identidade visual da música sem confundi-la com a thumbnail do vídeo.
(function (global) {
  "use strict";

  const DEFAULT_ARTWORK = "assets/icons/roudy-icon-v4-192.png";
  const FALLBACK_PATHS = new Set([
    "/assets/search/musicas.svg",
    "/assets/icons/roudy-icon-v4-192.png",
    "/assets/icons/roudy-icon-v4-512.png"
  ]);
  const YOUTUBE_IMAGE_HOST = /(^|\.)(ytimg\.com|youtube\.com)$/i;

  function cleanUrl(value) {
    const url = String(value || "").trim();
    if (!url || /^(javascript|vbscript):/i.test(url)) return null;
    if (/^(data:image\/|blob:|https?:\/\/|\.?\.?\/|\/)/i.test(url)) return url;
    return /^[a-z0-9][a-z0-9_./-]*$/i.test(url) ? url : null;
  }

  function isYoutubeThumbnail(value) {
    const url = cleanUrl(value);
    if (!url) return false;
    try { return YOUTUBE_IMAGE_HOST.test(new URL(url, global.location?.href || "https://roudy.local/").hostname); }
    catch (_error) { return false; }
  }

  function isFallbackArtwork(value) {
    const url = cleanUrl(value);
    if (!url) return false;
    try { return FALLBACK_PATHS.has(new URL(url, global.location?.href || "https://roudy.local/").pathname); }
    catch (_error) { return false; }
  }

  function realUrl(value) {
    const url = cleanUrl(value);
    return url && !isFallbackArtwork(url) ? url : null;
  }

  function resolveReal(song) {
    const source = song && typeof song === "object" ? song : {};
    const artwork = realUrl(source.artworkUrl);
    const legacy = realUrl(source.coverUrl);
    const youtube = realUrl(source.youtubeThumbnailUrl);
    const artworkSource = String(source.artworkSource || "").trim().toLocaleLowerCase("en-US");
    if (artwork && artworkSource !== "youtube") return artwork;
    if (legacy && !isYoutubeThumbnail(legacy)) return legacy;
    if (youtube) return youtube;
    if (artwork) return artwork;
    return legacy;
  }

  function resolve(song) {
    return resolveReal(song) || DEFAULT_ARTWORK;
  }

  function resolveYoutubeThumbnail(song) {
    const source = song && typeof song === "object" ? song : {};
    const explicit = cleanUrl(source.youtubeThumbnailUrl);
    if (explicit) return explicit;
    const legacy = cleanUrl(source.coverUrl);
    if (legacy && isYoutubeThumbnail(legacy)) return legacy;
    const videoId = String(source.youtubeVideoId || "").trim();
    return videoId ? `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg` : DEFAULT_ARTWORK;
  }

  function collectDistinct(songs, limit = 4) {
    const result = [];
    const seen = new Set();
    for (const song of Array.isArray(songs) ? songs : []) {
      const url = resolveReal(song);
      if (!url || seen.has(url)) continue;
      seen.add(url);
      result.push(url);
      if (result.length >= Math.max(0, Number(limit) || 0)) break;
    }
    return result;
  }

  function handleImageError(image, fallback = DEFAULT_ARTWORK) {
    if (!image || image.dataset.artworkFallbackApplied === "true") {
      if (image) image.hidden = true;
      return;
    }
    image.dataset.artworkFallbackApplied = "true";
    image.src = cleanUrl(fallback) || DEFAULT_ARTWORK;
  }

  global.songArtwork = Object.freeze({ DEFAULT_ARTWORK, cleanUrl, isYoutubeThumbnail, isFallbackArtwork, resolveReal, resolve, resolveYoutubeThumbnail, collectDistinct, handleImageError });
})(window);
