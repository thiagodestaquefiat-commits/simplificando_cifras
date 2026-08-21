const CACHE_NAME = "simplificando-cifras-v43";
const ASSETS = [
  "./",
  "./index.html",
  "./js/storage.js",
  "./js/song-model.js",
  "./js/song-repository.js",
  "./js/event-model.js?v=1",
  "./js/event-repository.js?v=1",
  "./js/event-chat.js?v=1",
  "./js/spotify-config.js",
  "./js/spotify-auth.js?v=2",
  "./js/spotify-api.js?v=2",
  "./js/spotify-song-linker.js?v=1",
  "./js/spotify-player.js?v=14",
  "./js/spotify-player-ui.js?v=13",
  "./js/spotify-ui.js?v=3",
  "./js/export-library.js",
  "./js/chord-library.js",
  "./js/instruments/instrument-definitions.js",
  "./js/instruments/multi-instrument-chord-library.js",
  "./js/chord-utils.js",
  "./js/navigation-context.js",
  "./js/editor/song-format.js",
  "./js/editor/song-editor-history.js",
  "./js/editor/song-editor-validation.js",
  "./js/editor/chord-simplifier.js",
  "./js/editor/song-editor-state.js",
  "./js/editor/song-editor-renderer.js",
  "./js/editor/song-editor.js",
  "./js/editor/song-editor.css",
  "./js/ai/api-config.js",
  "./js/ai/harmonic-summary-client.js",
  "./js/ai/ai-harmonic-summary.js",
  "./js/ai/ai-harmonic-summary.css",
  "./manifest.webmanifest?v=10",
  "./assets/logo-simplificando-cifras.png",
  "./assets/icons/pwa-icon-v10-192.png",
  "./assets/icons/pwa-icon-v10-512.png",
  "./assets/icons/pwa-icon-v10-maskable-192.png",
  "./assets/icons/pwa-icon-v10-maskable-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(ASSETS);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).then((response) => {
        if (response && response.status === 200) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put("./index.html", copy));
        }
        return response;
      }).catch(() => caches.match("./index.html"))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      return cached || fetch(event.request).then((response) => {
        if (!response || response.status !== 200 || response.type === "opaque") return response;
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      }).catch(() => Response.error());
    })
  );
});
