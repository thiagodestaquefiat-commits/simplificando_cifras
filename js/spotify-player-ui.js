(function (global) {
  "use strict";

  let context = null;
  let currentSongId = null;
  let currentTracks = [];
  let requestVersion = 0;
  let searchTimer = null;
  let manualMode = false;
  let expanded = false;
  let expandedPanel = null;
  let seeking = false;
  let playerState = { status: "idle", paused: true, spotifyUri: null, position: 0, duration: 0, repeatMode: 0, message: "" };
  const attemptedSongs = new Set();

  function element(id) { return global.document.getElementById(id); }
  function getSong() {
    return context && context.getSongs().find((song) => String(song.id) === String(currentSongId));
  }
  function clear(container) { while (container.firstChild) container.removeChild(container.firstChild); }
  function removeExpandedPanel() {
    if (expandedPanel && expandedPanel.parentNode) expandedPanel.parentNode.removeChild(expandedPanel);
    expandedPanel = null;
  }
  function button(label, className, handler, ariaLabel) {
    const item = global.document.createElement("button");
    item.type = "button";
    item.className = className;
    item.textContent = label;
    if (ariaLabel) item.setAttribute("aria-label", ariaLabel);
    item.addEventListener("click", handler);
    return item;
  }
  function imageFor(song, className) {
    if (!song.coverUrl) {
      const fallback = global.document.createElement("div");
      fallback.className = className + " song-player-cover-fallback";
      fallback.textContent = "♫";
      return fallback;
    }
    const cover = global.document.createElement("img");
    cover.className = className;
    cover.src = song.coverUrl;
    cover.alt = "Capa de " + song.title;
    return cover;
  }

  function formatDuration(milliseconds) {
    const value = Math.max(0, Math.round((Number(milliseconds) || 0) / 1000));
    return Math.floor(value / 60) + ":" + String(value % 60).padStart(2, "0");
  }

  function currentPosition(song) {
    const ownsPlayback = song && playerState.spotifyUri === song.spotifyUri;
    if (!ownsPlayback) return 0;
    const elapsed = playerState.paused ? 0 : Math.max(0, Date.now() - (playerState.updatedAt || Date.now()));
    return Math.min((Number(playerState.position) || 0) + elapsed, Number(playerState.duration) || Number(song.duration) || 0);
  }

  function updateProgress() {
    const song = getSong();
    if (!song) return;
    const duration = Number(playerState.duration) || Number(song.duration) || 0;
    const position = currentPosition(song);
    const compact = element("song-player-mini-timeline");
    if (compact && !seeking) {
      compact.max = String(Math.max(duration, 1));
      compact.value = String(Math.min(position, duration));
    }
    const range = element("song-player-progress");
    if (range && !seeking) {
      range.max = String(Math.max(duration, 1));
      range.value = String(Math.min(position, duration));
    }
    const elapsed = element("song-player-elapsed");
    const remaining = element("song-player-remaining");
    if (elapsed) elapsed.textContent = formatDuration(position);
    if (remaining) remaining.textContent = "-" + formatDuration(Math.max(0, duration - position));
  }

  function readableError(error) {
    const message = error && error.message ? error.message : String(error || "");
    if (/unexpected error|try again later/i.test(message)) return "O Spotify não respondeu agora. Tente novamente.";
    return message || "Não foi possível pesquisar no Spotify agora.";
  }

  function isPlaying(song) {
    return Boolean(song && playerState.spotifyUri === song.spotifyUri && playerState.paused === false);
  }

  function hasStarted(song) {
    return Boolean(song && playerState.spotifyUri === song.spotifyUri && playerState.hasStarted);
  }

  function syncPlaybackControls() {
    const song = getSong();
    if (!song) return;
    const started = hasStarted(song);
    const playing = isPlaying(song);
    const loading = playerState.status === "loading";
    const mini = global.document.querySelector(".song-player-mini-play");
    if (mini) {
      mini.textContent = playing ? "❚❚" : "▶";
      mini.setAttribute("aria-label", playing ? "Pausar" : "Tocar");
      mini.disabled = loading;
    }
    const main = global.document.querySelector(".song-player-main-play");
    if (main) {
      main.hidden = false;
      main.textContent = playing ? "❚❚" : "▶";
      main.setAttribute("aria-label", playing ? "Pausar" : "Tocar");
      main.disabled = loading;
    }
    global.document.querySelectorAll(".song-player-skip").forEach((control) => { control.disabled = !started || loading; });
    const miniTimeline = element("song-player-mini-timeline");
    if (miniTimeline) miniTimeline.disabled = !started || loading;
    const status = global.document.querySelector(".song-player-expanded-status");
    if (status) status.textContent = playerState.message || "Pronto para ouvir";
    const hint = global.document.querySelector(".song-player-native-hint");
    if (hint) hint.hidden = true;
    const repeat = global.document.querySelector(".song-player-repeat");
    if (repeat) repeat.classList.toggle("active", playerState.repeatMode === 2);
    updateProgress();
  }

  function renderResults(container, tracks) {
    const results = global.document.createElement("div");
    results.className = "song-player-results";
    tracks.forEach((track, index) => {
      const row = global.document.createElement("div");
      row.className = "song-player-result";
      row.appendChild(imageFor(track, "song-player-result-cover"));
      const info = global.document.createElement("div");
      info.className = "song-player-result-info";
      const title = global.document.createElement("strong");
      title.textContent = track.title;
      const meta = global.document.createElement("span");
      meta.textContent = [track.artist, track.album, formatDuration(track.duration)].filter(Boolean).join(" · ");
      info.append(title, meta);
      row.append(info, button("Usar", "song-player-link-btn", () => selectTrack(index)));
      results.appendChild(row);
    });
    container.appendChild(results);
  }

  function openExpanded() {
    global.spotifyPlayer.activate().catch(() => {});
    expanded = true;
    render();
  }

  function closeExpanded() {
    expanded = false;
    removeExpandedPanel();
    global.spotifyPlayer.setNativeVisible(false);
    render();
  }

  function renderCompact(container, song) {
    container.className = "song-player-shell is-linked";
    const compact = global.document.createElement("div");
    compact.className = "song-player-compact";
    compact.setAttribute("role", "button");
    compact.tabIndex = 0;
    compact.setAttribute("aria-label", "Abrir player de " + song.title);
    compact.addEventListener("click", openExpanded);
    compact.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openExpanded(); }
    });
    compact.appendChild(imageFor(song, "song-player-mini-cover"));
    const info = global.document.createElement("div");
    info.className = "song-player-mini-info";
    const title = global.document.createElement("strong");
    title.textContent = song.title;
    const artist = global.document.createElement("span");
    artist.textContent = song.artist || "Spotify";
    const timeline = global.document.createElement("input");
    timeline.id = "song-player-mini-timeline";
    timeline.className = "song-player-mini-timeline";
    timeline.type = "range";
    timeline.min = "0";
    timeline.step = "1000";
    timeline.setAttribute("aria-label", "Linha do tempo da música");
    timeline.addEventListener("click", (event) => event.stopPropagation());
    timeline.addEventListener("keydown", (event) => event.stopPropagation());
    timeline.addEventListener("input", () => { seeking = true; });
    timeline.addEventListener("change", async (event) => {
      event.stopPropagation();
      try { await global.spotifyPlayer.seek(Number(timeline.value)); }
      catch (error) { context.showToast(readableError(error)); }
      seeking = false;
    });
    timeline.disabled = !hasStarted(song);
    info.append(title, artist);
    const playing = isPlaying(song);
    const miniControls = global.document.createElement("div");
    miniControls.className = "song-player-mini-controls";
    const back = button("", "song-player-skip song-player-mini-skip", (event) => {
      event.stopPropagation();
      skip(-15);
    }, "Voltar 15 segundos");
    const backIcon = global.document.createElement("span");
    backIcon.className = "song-player-mini-skip-icon";
    backIcon.textContent = "↶";
    const backValue = global.document.createElement("small");
    backValue.textContent = "15";
    back.append(backIcon, backValue);
    back.disabled = !hasStarted(song) || playerState.status === "loading";
    const play = button(playing ? "❚❚" : "▶", "song-player-mini-play", (event) => {
      event.stopPropagation();
      togglePlayback();
    }, playing ? "Pausar" : "Tocar");
    play.disabled = playerState.status === "loading";
    const forward = button("", "song-player-skip song-player-mini-skip", (event) => {
      event.stopPropagation();
      skip(15);
    }, "Avançar 15 segundos");
    const forwardIcon = global.document.createElement("span");
    forwardIcon.className = "song-player-mini-skip-icon";
    forwardIcon.textContent = "↷";
    const forwardValue = global.document.createElement("small");
    forwardValue.textContent = "15";
    forward.append(forwardIcon, forwardValue);
    forward.disabled = !hasStarted(song) || playerState.status === "loading";
    miniControls.append(back, play, forward);
    compact.append(info, miniControls, timeline);
    container.appendChild(compact);
    updateProgress();
  }

  function renderExpanded(host, song) {
    removeExpandedPanel();
    const panel = global.document.createElement("div");
    panel.className = "song-player-expanded";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-label", "Player de " + song.title);

    const header = global.document.createElement("div");
    header.className = "song-player-expanded-header";
    header.append(
      button("⌄", "song-player-close", closeExpanded, "Reduzir player"),
      Object.assign(global.document.createElement("strong"), { textContent: "TOCANDO DO SPOTIFY" }),
      global.document.createElement("span")
    );
    const body = global.document.createElement("div");
    body.className = "song-player-expanded-body";
    body.appendChild(imageFor(song, "song-player-large-cover"));
    const details = global.document.createElement("div");
    details.className = "song-player-track-details";
    const title = global.document.createElement("h2");
    title.textContent = song.title;
    const artist = global.document.createElement("p");
    artist.textContent = song.artist || "Artista não informado";
    const album = global.document.createElement("span");
    album.textContent = song.album || "";
    details.append(title, artist, album);

    const range = global.document.createElement("input");
    range.id = "song-player-progress";
    range.className = "song-player-progress";
    range.type = "range";
    range.min = "0";
    range.step = "1000";
    range.addEventListener("input", () => {
      seeking = true;
      const elapsed = element("song-player-elapsed");
      const remaining = element("song-player-remaining");
      if (elapsed) elapsed.textContent = formatDuration(range.value);
      if (remaining) remaining.textContent = "-" + formatDuration(Number(range.max) - Number(range.value));
    });
    range.addEventListener("change", async () => {
      try { await global.spotifyPlayer.seek(Number(range.value)); }
      catch (error) { context.showToast(readableError(error)); }
      seeking = false;
    });
    const times = global.document.createElement("div");
    times.className = "song-player-times";
    const elapsed = global.document.createElement("span");
    elapsed.id = "song-player-elapsed";
    const remaining = global.document.createElement("span");
    remaining.id = "song-player-remaining";
    times.append(elapsed, remaining);

    const controls = global.document.createElement("div");
    controls.className = "song-player-controls";
    const customControlsReady = hasStarted(song);
    const back = button("↶", "song-player-skip", () => skip(-15), "Voltar 15 segundos");
    back.disabled = !customControlsReady;
    const playing = isPlaying(song);
    const play = button(playing ? "❚❚" : "▶", "song-player-main-play", () => {
      togglePlayback();
    }, playing ? "Pausar" : "Tocar");
    play.disabled = playerState.status === "loading";
    const forward = button("↷", "song-player-skip", () => skip(15), "Avançar 15 segundos");
    forward.disabled = !customControlsReady;
    const repeat = button("↻", "song-player-repeat" + (playerState.repeatMode === 2 ? " active" : ""), toggleRepeat, "Repetir música");
    controls.append(back, play, forward, repeat);

    const status = global.document.createElement("p");
    status.className = "song-player-expanded-status";
    status.textContent = playerState.message || "Pronto para ouvir";
    const nativeHint = global.document.createElement("p");
    nativeHint.className = "song-player-native-hint";
    nativeHint.textContent = "O controle oficial do Spotify continua disponível abaixo.";
    nativeHint.hidden = true;
    const change = button("Encontrar outra gravação", "song-player-change", showManualSearch);
    body.append(details, range, times, controls, status, nativeHint, change);
    panel.append(header, body);
    host.appendChild(panel);
    expandedPanel = panel;
    updateProgress();
  }

  function renderSearch(container, message) {
    container.className = "song-player-shell is-search";
    const heading = global.document.createElement("div");
    heading.className = "song-player-heading";
    heading.textContent = "Player de estudo";
    const description = global.document.createElement("p");
    description.className = "song-player-help";
    description.textContent = message || "Encontre a gravação correta para usar neste player.";
    const row = global.document.createElement("div");
    row.className = "song-player-search";
    const input = global.document.createElement("input");
    input.id = "song-player-search-input";
    input.type = "search";
    input.placeholder = "Música ou artista";
    input.value = global.spotifySongLinker.searchQuery(getSong());
    input.addEventListener("input", scheduleSearch);
    input.addEventListener("keydown", (event) => { if (event.key === "Enter") search(); });
    row.append(input, button("Buscar", "song-player-search-btn", search));
    container.append(heading, description, row);
    if (currentTracks.length) renderResults(container, currentTracks);
  }

  function render(message) {
    const container = element("spotify-song-player");
    const song = getSong();
    if (!container || !song) return;
    // A interface visível controla o dispositivo criado pelo Web Playback SDK.
    global.spotifyPlayer.setNativeVisible(false);
    removeExpandedPanel();
    clear(container);
    if (!global.spotifyAuth.isAuthenticated()) {
      renderSearch(container, "Conecte sua conta Spotify para ouvir e associar esta música.");
      container.appendChild(button("Conectar Spotify", "song-player-connect", () => global.spotifyAuth.startAuthorization()));
      return;
    }
    if (song.spotifyUri && !manualMode) {
      renderCompact(container, song);
      if (expanded) renderExpanded(element("view-detail"), song);
    }
    else renderSearch(container, message);
  }

  function persistLink(track) {
    const song = getSong();
    if (!song || !track) return null;
    const result = global.songRepository.update(context.getSongs(), song.id, global.spotifySongLinker.changesForTrack(song, track));
    context.setSongs(result.songs);
    context.persistSongs(result.songs);
    context.renderSongs();
    return result.song;
  }

  async function showSong(song) {
    currentSongId = song && song.id;
    currentTracks = [];
    manualMode = false;
    expanded = false;
    removeExpandedPanel();
    global.spotifyPlayer.setNativeVisible(false);
    const version = ++requestVersion;
    render();
    if (song && song.spotifyUri && global.spotifyAuth.isAuthenticated()) {
      global.spotifyPlayer.prepare(song).catch(() => {});
    }
    if (!song || song.spotifyUri || !global.spotifyAuth.isAuthenticated() || attemptedSongs.has(String(song.id))) return;
    attemptedSongs.add(String(song.id));
    try {
      const tracks = await global.spotifyApi.searchTracks(global.spotifySongLinker.searchQuery(song), 8);
      if (version !== requestVersion || String(currentSongId) !== String(song.id)) return;
      const match = global.spotifySongLinker.findAutomaticMatch(song, tracks);
      if (match) {
        persistLink(match);
        context.showToast("Spotify associado automaticamente");
        render();
      } else {
        currentTracks = tracks;
        render(tracks.length ? "Confira e selecione a gravação correta." : "Nenhuma correspondência exata. Faça uma busca manual.");
      }
    } catch (error) {
      if (version === requestVersion) render(readableError(error));
    }
  }

  function hide() {
    currentSongId = null;
    currentTracks = [];
    manualMode = false;
    expanded = false;
    removeExpandedPanel();
    requestVersion += 1;
    clearTimeout(searchTimer);
  }

  function showManualSearch() {
    currentTracks = [];
    if (!getSong()) return;
    manualMode = true;
    expanded = false;
    removeExpandedPanel();
    global.spotifyPlayer.setNativeVisible(false);
    render("Pesquise e selecione outra gravação.");
  }

  function scheduleSearch() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(search, 350);
  }

  async function search() {
    const input = element("song-player-search-input");
    const query = input ? input.value.trim() : "";
    if (query.length < 2) return;
    const version = ++requestVersion;
    try {
      currentTracks = await global.spotifyApi.searchTracks(query, 8);
      if (version === requestVersion && getSong()) render(currentTracks.length ? "Selecione a gravação correta." : "Nenhuma música encontrada.");
    } catch (error) {
      if (version === requestVersion) render(readableError(error));
    }
  }

  function selectTrack(index) {
    const track = currentTracks[index];
    if (!track) return;
    persistLink(track);
    currentTracks = [];
    manualMode = false;
    context.showToast("Música vinculada ao Spotify");
    render();
  }

  async function togglePlayback() {
    try { await global.spotifyPlayer.toggle(getSong()); }
    catch (error) {
      playerState = { ...playerState, status: "error", message: readableError(error) };
      render();
    }
  }

  async function skip(seconds) {
    try { await global.spotifyPlayer.skip(seconds); }
    catch (error) { context.showToast(readableError(error)); }
  }

  async function toggleRepeat() {
    try { await global.spotifyPlayer.setRepeat(playerState.repeatMode !== 2); }
    catch (error) { context.showToast(readableError(error)); }
  }

  function initialize(options) {
    context = options;
    global.spotifyPlayer.subscribe((nextState) => {
      playerState = nextState;
      if (currentSongId !== null) syncPlaybackControls();
    });
    global.setInterval(updateProgress, 500);
  }

  global.spotifyPlayerUI = Object.freeze({ initialize, showSong, hide, search, scheduleSearch, selectTrack, togglePlayback });
})(window);
