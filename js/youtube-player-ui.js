(function (global) {
  "use strict";

  let context = null;
  let currentSongId = null;
  let currentVideos = [];
  let requestVersion = 0;
  let requestController = null;
  let searchTimer = null;
  let manualMode = false;
  let expanded = false;

  function element(id) { return global.document.getElementById(id); }
  function getSong() {
    return context && context.getSongs().find((song) => String(song.id) === String(currentSongId));
  }
  function clear(container) { while (container.firstChild) container.removeChild(container.firstChild); }
  function button(label, className, handler, ariaLabel) {
    const item = global.document.createElement("button");
    item.type = "button";
    item.className = className;
    item.textContent = label;
    if (ariaLabel) item.setAttribute("aria-label", ariaLabel);
    item.addEventListener("click", handler);
    return item;
  }
  function playerTop(container) {
    const header = element("view-detail")?.querySelector(".detail-header");
    container.style.top = `${Math.ceil(header?.getBoundingClientRect().height || 58)}px`;
  }
  function readableError(error) {
    if (error && error.name === "AbortError") return "";
    if (error?.status === 429) return "O limite temporário de buscas do YouTube foi atingido.";
    return error?.message || "Não foi possível pesquisar no YouTube agora.";
  }
  function imageFor(source, className) {
    const cover = global.document.createElement("img");
    cover.className = className;
    cover.src = source.coverUrl || `https://i.ytimg.com/vi/${source.youtubeVideoId}/hqdefault.jpg`;
    cover.alt = `Miniatura de ${source.title}`;
    return cover;
  }

  function renderResults(container, videos) {
    const results = global.document.createElement("div");
    results.className = "youtube-song-results";
    videos.forEach((video, index) => {
      const row = global.document.createElement("div");
      row.className = "youtube-song-result";
      row.appendChild(imageFor(video, "youtube-song-result-cover"));
      const info = global.document.createElement("div");
      info.className = "youtube-song-result-info";
      const title = global.document.createElement("strong");
      title.textContent = video.title;
      const channel = global.document.createElement("span");
      channel.textContent = video.youtubeChannelTitle || video.artist || "YouTube";
      info.append(title, channel);
      row.append(info, button("Usar", "youtube-song-link-btn", () => selectVideo(index)));
      results.appendChild(row);
    });
    container.appendChild(results);
  }

  function renderCollapsed(container, song) {
    container.className = "youtube-player-shell is-linked is-collapsed";
    playerTop(container);
    const card = global.document.createElement("button");
    card.type = "button";
    card.className = "youtube-player-preview";
    card.setAttribute("aria-label", `Abrir vídeo de ${song.title}`);
    const info = global.document.createElement("span");
    info.className = "youtube-player-preview-info";
    const provider = global.document.createElement("small");
    provider.textContent = "VÍDEO PARA ESTUDO";
    const title = global.document.createElement("strong");
    title.textContent = song.title;
    const channel = global.document.createElement("span");
    channel.textContent = song.youtubeChannelTitle || song.artist || "YouTube";
    info.append(provider, title, channel);
    const thumbWrap = global.document.createElement("span");
    thumbWrap.className = "youtube-player-preview-thumb";
    thumbWrap.append(imageFor(song, "youtube-player-preview-image"), Object.assign(global.document.createElement("span"), { className: "youtube-player-preview-play", textContent: "▶" }));
    card.append(info, thumbWrap);
    card.addEventListener("click", openExpanded);
    container.appendChild(card);
  }

  function renderExpanded(container, song) {
    container.className = "youtube-player-shell is-linked is-expanded";
    playerTop(container);
    const bar = global.document.createElement("div");
    bar.className = "youtube-player-bar";
    const details = global.document.createElement("div");
    details.className = "youtube-player-bar-info";
    details.append(
      Object.assign(global.document.createElement("strong"), { textContent: song.title }),
      Object.assign(global.document.createElement("span"), { textContent: song.youtubeChannelTitle || song.artist || "YouTube" })
    );
    const link = global.document.createElement("a");
    link.className = "youtube-open-link";
    link.href = song.youtubeUrl || `https://www.youtube.com/watch?v=${encodeURIComponent(song.youtubeVideoId)}`;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = "YouTube ↗";
    bar.append(button("⌃", "youtube-player-collapse", closeExpanded, "Recolher vídeo"), details, link);
    const frame = global.document.createElement("div");
    frame.id = "youtube-iframe-player";
    frame.className = "youtube-player-frame";
    const status = global.document.createElement("p");
    status.className = "youtube-player-status";
    status.textContent = "Carregando player oficial do YouTube…";
    const change = button("Escolher outro vídeo", "youtube-player-change", showManualSearch);
    container.append(bar, frame, status, change);
    global.requestAnimationFrame(() => {
      global.youtubePlayer.mount("youtube-iframe-player", song.youtubeVideoId, {
        onReady() { status.textContent = "Player pronto"; },
        onError() { status.textContent = "Este vídeo não permite reprodução incorporada. Escolha outro vídeo."; }
      }).catch((error) => { status.textContent = readableError(error); });
    });
  }

  function renderSearch(container, message) {
    container.className = "youtube-player-shell is-search";
    container.style.removeProperty("top");
    const heading = global.document.createElement("div");
    heading.className = "youtube-player-heading";
    heading.textContent = "Vídeo para estudo";
    const description = global.document.createElement("p");
    description.className = "youtube-player-help";
    description.textContent = message || "Encontre a gravação correta desta música no YouTube.";
    const row = global.document.createElement("div");
    row.className = "youtube-player-search";
    const input = global.document.createElement("input");
    input.id = "youtube-song-search-input";
    input.type = "search";
    input.placeholder = "Música ou artista";
    input.value = global.youtubeSongLinker.searchQuery(getSong());
    input.addEventListener("input", scheduleSearch);
    input.addEventListener("keydown", (event) => { if (event.key === "Enter") search(); });
    row.append(input, button("Buscar", "youtube-song-search-btn", search));
    container.append(heading, description, row);
    if (currentVideos.length) renderResults(container, currentVideos);
  }

  function render(message) {
    const container = element("youtube-song-player");
    const song = getSong();
    if (!container || !song) return;
    global.youtubePlayer.destroy();
    clear(container);
    if (song.youtubeVideoId && !manualMode) {
      if (expanded) renderExpanded(container, song);
      else renderCollapsed(container, song);
    } else renderSearch(container, message);
  }

  function persistLink(video) {
    const song = getSong();
    if (!song || !video) return null;
    const result = global.songRepository.update(context.getSongs(), song.id, global.youtubeSongLinker.changesForVideo(song, video));
    context.setSongs(result.songs);
    context.persistSongs(result.songs);
    context.renderSongs();
    return result.song;
  }

  function showSong(song) {
    currentSongId = song && song.id;
    currentVideos = [];
    manualMode = false;
    expanded = false;
    requestVersion += 1;
    render();
  }

  function hide() {
    currentSongId = null;
    currentVideos = [];
    manualMode = false;
    expanded = false;
    requestVersion += 1;
    clearTimeout(searchTimer);
    if (requestController) requestController.abort();
    requestController = null;
    global.youtubePlayer.destroy();
    const container = element("youtube-song-player");
    if (container) { clear(container); container.className = "youtube-player-shell"; container.style.removeProperty("top"); }
  }

  function openExpanded() { expanded = true; render(); }
  function closeExpanded() { global.youtubePlayer.pause(); expanded = false; render(); }
  function showManualSearch() {
    global.youtubePlayer.pause();
    currentVideos = [];
    manualMode = true;
    expanded = false;
    render("Pesquise e selecione outra gravação.");
  }
  function scheduleSearch() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(search, 700);
  }
  async function search() {
    const input = element("youtube-song-search-input");
    const query = input ? input.value.trim() : "";
    if (query.length < 3) return;
    const version = ++requestVersion;
    if (requestController) requestController.abort();
    requestController = new AbortController();
    try {
      currentVideos = await global.youtubeApi.searchVideos(query, 8, { signal: requestController.signal });
      if (version === requestVersion && getSong()) render(currentVideos.length ? "Selecione a gravação correta." : "Nenhum vídeo encontrado.");
    } catch (error) {
      if (version === requestVersion && error?.name !== "AbortError") render(readableError(error));
    }
  }
  function selectVideo(index) {
    const video = currentVideos[index];
    if (!video) return;
    persistLink(video);
    currentVideos = [];
    manualMode = false;
    expanded = false;
    context.showToast("Música vinculada ao YouTube");
    render();
  }
  function initialize(options) { context = options; }

  global.youtubePlayerUI = Object.freeze({ initialize, showSong, hide, search, scheduleSearch, selectVideo, openExpanded, closeExpanded });
})(window);
