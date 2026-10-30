// MANUTENÇÃO: Cache dos arquivos do PWA: instalação, troca de versão e atendimento offline.
// MANUTENÇÃO: Não é o banco da playlist; mudanças de cache não devem apagar dados pessoais.
// MANUTENÇÃO: Atualize a versão e os recursos necessários quando mudar arquivos carregados pela interface.
const CACHE_NAME = "simplificando-cifras-v687-chat-send-icon";
// Compatibility marker: simplificando-cifras-v623-playlists-indexeddb
// Compatibility marker: simplificando-cifras-v622-playlists-exclusao-explicita
// Compatibility marker: simplificando-cifras-v621-playlists-na-nuvem
// Compatibility marker: simplificando-cifras-v619-ajustar-cifra-contexto
// Compatibility marker: simplificando-cifras-v618-sheet-key-match
// Compatibility marker: simplificando-cifras-v616-organizar-resumos
// Compatibility marker: simplificando-cifras-v614-search-delete-danger
// Compatibility marker: simplificando-cifras-v588-sheet-key-match
// Compatibility marker: simplificando-cifras-v521-organizar-catalogo
// Compatibility marker: simplificando-cifras-v520-organizar-resumos
// Compatibility marker: simplificando-cifras-v519-organizar-resumos
// Compatibility marker: simplificando-cifras-v516-main-integrada
// Compatibility marker: simplificando-cifras-v515-historico-vocal
// Compatibility marker: simplificando-cifras-v518-evento-salvar-musica
// Compatibility marker: simplificando-cifras-v517-evento-copias-musicas
// Compatibility marker: simplificando-cifras-v513-partituras
// Compatibility marker: simplificando-cifras-v512-playlists-sugestoes
// Compatibility marker: simplificando-cifras-v511-playlists-estilos
// Compatibility marker: simplificando-cifras-v510-sugestoes-encerramento
// Compatibility marker: simplificando-cifras-v510-playlists-home
// Compatibility marker: simplificando-cifras-v509-restaura-ajustes-aprovados
// Compatibility marker: simplificando-cifras-v508-restaura-ajustes-aprovados
// Compatibility marker: simplificando-cifras-v507-thiago-gisele-1013
// Compatibility marker: simplificando-cifras-v506-palco-letra-branca
// Compatibility marker: simplificando-cifras-v505-palco-sem-bordas
// Compatibility marker: simplificando-cifras-v504-restauracao-estudo-evento-palco
// Compatibility marker: simplificando-cifras-v503-palco-bolinhas
// Compatibility marker: simplificando-cifras-v502-tom-lider-corrigido
// Compatibility marker: simplificando-cifras-v501-aba-home
// Compatibility marker: simplificando-cifras-v500-pestana-branca
// Compatibility marker: simplificando-cifras-v499-palco-visualizacao
// Compatibility marker: simplificando-cifras-v498-evento-tom-lider
// Compatibility marker: simplificando-cifras-v497-busca-sem-youtube
// Compatibility marker: simplificando-cifras-v496-gisele-thiago-1013
// Compatibility marker: simplificando-cifras-v495-search-metadata-fallback
// Compatibility marker: simplificando-cifras-v475-metronome-drag
// Compatibility marker: simplificando-cifras-v365-github-integrado
// Compatibility marker: simplificando-cifras-v365-responsivo
// Compatibility marker: simplificando-cifras-v365-desempenho-1010
// Legacy test marker: simplificando-cifras-v348-voz-assistente
// Compatibility marker: simplificando-cifras-v199-tablaturas-detectadas
// Compatibility marker: simplificando-cifras-v325-external-reply-context
// Compatibility marker: simplificando-cifras-v427-voz-direta
// Compatibility marker: simplificando-cifras-v480-temas-cores-1012
const ASSETS = [
  "./css/event-share-variants.css?v=5",
  "./js/event-detail-refactor.css?v=115",
  "./js/event-detail-refactor.css?v=55",
  "./assets/icons/icone-ajuste-vertical.svg",
  "./assets/icons/icone-qrcode-roudy.svg",
  "./assets/icons/icone-teclado-musical.svg",
  "./assets/icons/icone-fone-mais.svg",
  "./css/search-menu.css?v=18",
  "./css/stage-mode-reference.css?v=19",
  "./css/song-section-heading.css?v=1",
  "./js/search-menu.js?v=10",
  "./js/list-loading.js?v=1",
  "./assets/search/musicas.svg?v=2",
  "./assets/search/eventos.svg?v=2",
  "./assets/search/playlists.svg?v=2",
  "./assets/search/medley.svg",
  "./js/event-detail-refactor.css?v=54",
  "./css/home-playlists.css?v=29",
  "./js/home-playlists.js?v=24",
  "./js/user-playlists.js?v=6",
  "./js/notification-center.js?v=6",
  "./js/playlist-collaboration.js?v=1",
  "./js/personal-playlist-sync.js?v=3",
  "./js/playlist-invites.js?v=5",
  "./js/event-model.js?v=8",
  "./js/event-user-invites.js?v=10",
  "./js/event-collaboration-client.js?v=19",
  "./js/event-detail-refactor.css?v=53",
  "./js/event-user-invites.js?v=9",
  "./js/event-collaboration-client.js?v=16",
  "./js/app-auth.js?v=16",
  "./js/event-qr-scanner.js?v=2",
  "./js/event-qr-scanner.css?v=1",
  "./js/vendor/jsqr.min.js?v=1",
  "./js/profile-qr.js?v=4",
  "./js/profile-qr.css?v=2",
  "./js/account-drawer.css?v=17",
  "./js/account-profile.css?v=4",
  "./css/home-playlists.css?v=1",
  "./js/user-playlists.js?v=1",
  "./js/home-playlists.js?v=1",
  "./js/home-playlists.js?v=2",
  "./js/home-playlists.js?v=3",
  "./js/home-playlists.js?v=4",
  "./js/home-playlists.js?v=5",
  "./js/home-playlists.js?v=6",
  "./js/home-playlists.js?v=7",
  "./css/song-reading.css?v=5",
  "./css/song-reading.css?v=6",
  "./css/song-reading.css?v=7",
  "./css/song-reading.css?v=8",
  "./css/song-reading.css?v=9",
  "./css/song-reading.css?v=10",
  "./css/song-reading.css?v=11",
  "./css/song-reading.css?v=12",
  "./css/song-reading.css?v=13",
  "./css/song-reading.css?v=15",
  "./js/ai/ai-harmonic-summary.js?v=21",
  "./js/app-assistant.js?v=30",
  "./js/app-assistant.js?v=31",
  "./js/app-assistant.js?v=32",
  "./js/app-assistant.js?v=33",
  "./js/event-user-invites.js?v=8",
  "./css/song-reading.css?v=3",
  "./css/topbar-labels.css?v=10",
  "./css/topbar-labels.css?v=12",
  "./css/topbar-labels.css?v=13",
  "./css/topbar-labels.css?v=14",
  "./js/ai/ai-harmonic-summary.js?v=19",
  "./js/assistant-language.js?v=1",
  "./js/assistant-actions.js?v=5",
  "./js/assistant-actions.js?v=6",
  "./js/assistant-actions.js?v=7",
  "./js/assistant-actions.js?v=8",
  "./js/assistant-actions.js?v=9",
  "./js/assistant-action-manager.js?v=5",
  "./js/assistant-action-runtime.js?v=6",
  "./js/assistant-memory.js?v=2",
  "./js/assistant-dialogue.js?v=4",
  "./js/assistant-sequences.js?v=2",
  "./js/assistant-voice.js?v=4",
  "./css/topbar-labels.css?v=2",
  "./js/assistant-actions.js?v=2",
  "./js/assistant-action-manager.js?v=2",
  "./js/assistant-action-runtime.js?v=2",
  "./js/app-assistant.js?v=24",
  "./js/assistant-actions.js?v=1",
  "./js/assistant-action-manager.js?v=1",
  "./js/assistant-action-runtime.js?v=1",
  "./js/app-assistant.js?v=23",
  "./js/youtube-player-ui.js?v=19",
  "./js/youtube-player-ui.js?v=20",
  "./js/youtube-player-ui.js?v=21",
  "./js/smart-scroll.js?v=7",
  "./js/tuner.js?v=4",
  "./js/tuner.js?v=5",
  "./js/smart-scroll.js?v=6",
  "./js/chord-audio.js?v=2",
  "./css/song-reading.css?v=2",
  "./css/song-reading.css?v=4",
  "./css/responsive.css?v=1",
  "./js/medley-repository.js?v=2",
  "./js/song-repository.js?v=16",
  "./css/roudy-forms.css?v=9",
  "./assets/icons/roudy-assistant-headphones.svg?v=1",
  "./js/song-repository.js?v=17",
  "./css/roudy-forms.css?v=7",
  "./css/light-theme.css?v=1",
  "./js/ai/ai-harmonic-summary.css?v=9",
  "./js/study-metronome.js?v=7",
  "./js/youtube-api.js?v=8",
  "./js/youtube-song-linker.js?v=2",
  "./js/youtube-player-ui.js?v=23",
  "./js/spotify-player-ui.js?v=23",
  "./js/youtube-player-ui.js?v=18",
  "./js/youtube-player.js?v=8",
  "./js/tablature.js?v=2",
  "./js/song-model.js?v=7",
  "./js/song-artwork.js?v=2",
  "./js/sheet-music.js?v=1",
  "./js/editor/song-format.js?v=12",
  "./js/editor/song-format.js?v=13",
  "./js/event-model.js?v=6",
  "./js/event-repository.js?v=10",
  "./js/closing-suggestions.js?v=1",
  "./js/event-collaboration-client.js?v=15",
  "./js/smart-scroll.js?v=5",
  "./js/assistant-intent-catalog.js?v=1",
  "./js/assistant-intent-client.js?v=1",
  "./js/app-assistant.js?v=25",
  "./js/assistant-voice.js?v=3",
  "./",
  "./index.html",
  "./js/storage.js",
  "./js/storage.js?v=3",
  "./js/tablature.js?v=1",
  "./js/song-model.js?v=5",
  "./js/demo-library.js?v=5",
  "./js/medley-repository.js?v=1",
  "./js/app-assistant.js?v=1",
  "./js/app-assistant.js?v=2",
  "./js/app-assistant.js?v=3",
  "./js/app-assistant.js?v=4",
  "./js/app-assistant.js?v=5",
  "./js/app-assistant.js?v=6",
  "./js/app-assistant.js?v=7",
  "./js/app-assistant.js?v=8",
  "./js/app-assistant.js?v=9",
  "./js/app-assistant.js?v=10",
  "./js/app-assistant.js?v=11",
  "./js/app-assistant.js?v=12",
  "./js/app-assistant.js?v=13",
  "./js/app-assistant.js?v=14",
  "./js/app-assistant.js?v=15",
  "./js/app-assistant.js?v=16",
  "./js/app-assistant.js?v=17",
  "./js/app-assistant.js?v=18",
  "./js/app-assistant.js?v=19",
  "./js/app-assistant.js?v=20",
  "./js/song-repository.js?v=13",
  "./js/song-repository.js?v=14",
  "./js/library-sync.js?v=16",
  "./js/library-sync.js?v=17",
  "./js/library-sync-policy.js?v=1",
  "./js/library-sync.js?v=18",
  "./js/library-sync.js?v=19",
  "./js/library-sync.js?v=20",
  "./js/library-sync.js?v=21",
  "./js/song-repository.js?v=15",
  "./js/library-recovery.js?v=2",
  "./js/event-model.js?v=5",
  "./js/event-repository.js?v=6",
  "./js/event-repository.js?v=7",
  "./js/event-repository.js?v=8",
  "./js/event-collaboration-client.js?v=11",
  "./js/event-collaboration-client.js?v=12",
  "./js/event-collaboration-client.js?v=13",
  "./js/event-collaboration-client.js?v=14",
  "./js/event-share.js?v=4",
  "./js/event-user-invites.js?v=1",
  "./js/event-user-invites.css?v=1",
  "./js/event-user-invites.js?v=2",
  "./js/event-user-invites.js?v=3",
  "./js/event-user-invites.js?v=4",
  "./js/event-user-invites.js?v=5",
  "./js/event-user-invites.js?v=7",
  "./js/vendor/qrcode.min.js?v=1",
  "./js/event-user-invites.js?v=6",
  "./js/profile-username.js?v=1",
  "./js/profile-username.js?v=2",
  "./js/profile-username.js?v=4",
  "./js/event-user-invites.css?v=2",
  "./js/event-user-invites.css?v=3",
  "./js/event-people-search.css?v=2",
  "./js/account-drawer.css?v=12",
  "./js/account-tools.css?v=3",
  "./js/account-profile.css?v=3",
  "./js/event-member-profile.css?v=2",
  "./js/event-detail-refactor.css?v=50",
  "./js/event-detail-refactor.css?v=51",
  "./js/event-detail-refactor.css?v=52",
  "./assets/chat-cables-background.png",
  "./js/notification-center.js?v=3",
  "./js/app-auth.js?v=12",
  "./js/app-auth.js?v=13",
  "./js/app-auth.js?v=14",
  "./js/app-auth.js?v=15",
  "./js/ui-i18n.js?v=10",
  "./js/ui-i18n.js?v=12",
  "./js/ui-i18n.js?v=14",
  "./js/tuner.js?v=2",
  "./js/tuner.js?v=3",
  "./js/chord-audio.js?v=1",
  "./js/smart-scroll.js?v=3",
  "./js/smart-scroll.js?v=4",
  "./js/sync-realtime.js?v=1",
  "./js/sync-realtime.js?v=2",
  "./js/band-client.js?v=1",
  "./js/location-service.js?v=2",
  "./js/map-preview.js?v=2",
  "./js/location-autocomplete.js?v=1",
  "./js/event-chat.js?v=2",
  "./js/event-chat.js?v=3",
  "./js/event-chat.js?v=7",
  "./js/event-chat-song.css?v=6",
  "./js/account-contribution.css?v=13",
  "./js/account-settings-ui.css?v=2",
  "./js/song-lyrics-typography.css?v=4",
  "./js/medley-editor.css?v=30",
  "./assets/empty-medley-disc.svg",
  "./assets/empty-events-calendar.svg",
  "./assets/keyboard-icon.svg",
  "./js/youtube-api.js?v=4",
  "./js/youtube-song-linker.js?v=1",
  "./js/youtube-player.js?v=3",
  "./js/youtube-player-ui.js?v=3",
  "./js/youtube-ui.js?v=3",
  "./js/export-library.js",
  "./js/export-library.js?v=2",
  "./js/export-library.js?v=3",
  "./js/export-library.js?v=4",
  "./js/library-recovery.js?v=1",
  "./js/import-library.js?v=1",
  "./js/import-library.js?v=2",
  "./js/import-library.js?v=3",
  "./js/chord-library.js",
  "./js/instruments/instrument-definitions.js",
  "./js/instruments/multi-instrument-chord-library.js?v=2",
  "./js/chord-utils.js",
  "./js/navigation-context.js",
  "./js/stage-preferences.js?v=3",
  "./js/stage-offline.js?v=1",
  "./js/stage-offline.js?v=2",
  "./js/event-offline.js?v=2",
  "./js/context-intelligence.js?v=4",
  "./js/preparation-receipts.js?v=1",
  "./js/contextual-copy.js?v=3",
  "./js/context-delivery.js?v=2",
  "./js/context-acknowledgements.js?v=1",
  "./js/context-history.js?v=2",
  "./js/study-metronome.js?v=2",
  "./js/study-metronome.js?v=3",
  "./js/study-metronome.js?v=4",
  "./js/study-metronome.js?v=5",
  "./js/study-metronome.css?v=3",
  "./js/editor/song-format.js?v=10",
  "./js/editor/song-editor-history.js",
  "./js/editor/song-editor-validation.js",
  "./js/editor/chord-simplifier.js",
  "./js/editor/song-editor-state.js",
  "./js/editor/song-editor-renderer.js",
  "./js/editor/song-editor.js",
  "./js/editor/song-editor.css?v=1",
  "./js/ai/api-config.js?v=7",
  "./js/song-reports.js?v=1",
  "./js/ai/harmonic-summary-client.js?v=17",
  "./js/summary-organizer.js?v=1",
  "./js/summary-organizer.js?v=2",
  "./js/summary-organizer.js?v=3",
  "./js/ai/ai-harmonic-summary.css?v=8",
  "./js/ai/camera-capture.js?v=6",
  "./css/editorial-typography.css?v=3",
  "./css/roudy-color-system-preview.css?v=16",
  "./manifest.webmanifest?v=15",
  "./assets/icons/roudy-icon-v4-48.png?v=15",
  "./assets/icons/roudy-rd-premium.svg?v=1",
  "./assets/icons/roudy-icon-v4-192.png",
  "./assets/icons/roudy-icon-v4-512.png",
  "./assets/icons/roudy-icon-v4-maskable-192.png",
  "./assets/icons/roudy-icon-v4-maskable-512.png",
  "./assets/icons/roudy-icon-v4-192.png?v=15",
  "./assets/icons/roudy-icon-v4-512.png?v=15",
  "./assets/icons/roudy-icon-v4-maskable-192.png?v=15",
  "./assets/icons/roudy-icon-v4-maskable-512.png?v=15",
  "./assets/qr-contribuicao.png?v=1",
  "./assets/playlist-hero-background.png"
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
