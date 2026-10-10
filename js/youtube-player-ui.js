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
  let openSelectedVideoPaused = false;
  let controlsTimer = null;
  let controlsElement = null;
  let repeatPanel = null;
  let floating = false;
  let floatingOffset = { x: 0, y: 0 };
  let playerHome = null;
  let playerNextSibling = null;
  let activePlayerContainer = null;
  let iframeFocusHandler = null;
  let detailScrollCleanup = null;
  let excludedVideoId = null;
  const CONTROLS_DURATION = 4500;

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
    // O player participa do fluxo imediatamente abaixo do cabeçalho. No estado
    // expandido ele assume top:0 via CSS conforme o cabeçalho é consumido.
    container.style.removeProperty("top");
  }
  function readableError(error) {
    if (error && error.name === "AbortError") return "";
    if (error?.status === 429) return "O limite temporário de buscas do YouTube foi atingido.";
    if (error instanceof TypeError || /load failed|failed to fetch/i.test(String(error?.message || ""))) {
      return "Não foi possível conectar à busca. Recarregue o app e tente novamente.";
    }
    return error?.message || "Não foi possível pesquisar no YouTube agora.";
  }
  function imageFor(source, className) {
    const cover = global.document.createElement("img");
    cover.className = className;
    cover.src = source.coverUrl || `https://i.ytimg.com/vi/${source.youtubeVideoId}/hqdefault.jpg`;
    cover.alt = `Miniatura de ${source.title}`;
    return cover;
  }

  function formatTime(value) {
    const seconds = Math.max(0, Math.floor(Number(value) || 0));
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  }
  function clearControlsTimer() {
    if (controlsTimer) global.clearTimeout(controlsTimer);
    controlsTimer = null;
  }
  function hideControls() {
    clearControlsTimer();
    if (repeatPanel) return;
    if (controlsElement) controlsElement.classList.remove("is-visible");
    activePlayerContainer?.focus?.({ preventScroll: true });
  }
  function showControls() {
    if (!controlsElement) return;
    controlsElement.classList.add("is-visible");
    clearControlsTimer();
    if (!repeatPanel) controlsTimer = global.setTimeout(hideControls, CONTROLS_DURATION);
  }
  function closeRepeatPanel() {
    if (repeatPanel) repeatPanel.remove();
    repeatPanel = null;
  }
  function resetFloating(container) {
    floating = false;
    floatingOffset = { x: 0, y: 0 };
    if (!container) return;
    if (playerHome) {
      if (playerNextSibling && playerNextSibling.parentNode === playerHome) playerHome.insertBefore(container, playerNextSibling);
      else playerHome.appendChild(container);
    }
    playerHome = null;
    playerNextSibling = null;
    container.classList.remove("is-floating", "is-dragging");
    container.style.removeProperty("transform");
  }
  function cleanupPlayerUi(container) {
    clearControlsTimer();
    controlsElement = null;
    closeRepeatPanel();
    if (iframeFocusHandler) global.removeEventListener("blur", iframeFocusHandler);
    iframeFocusHandler = null;
    activePlayerContainer = null;
    if (detailScrollCleanup) detailScrollCleanup();
    detailScrollCleanup = null;
    const detail = element("view-detail");
    if (detail) {
      detail.style.removeProperty("--video-header-progress");
      detail.classList.remove("video-study-expanded");
    }
    resetFloating(container);
  }

  function recoverUnavailableVideo(song, message) {
    excludedVideoId = String(song?.youtubeVideoId || "").trim() || null;
    currentVideos = [];
    manualMode = true;
    expanded = false;
    render(message || "Este vídeo não está disponível no player. Buscando outras gravações…");
    global.setTimeout(search, 0);
  }

  function setupDetailScrollMotion() {
    const detail = element("view-detail");
    if (!detail) return;
    detail.classList.add("video-study-expanded");
    let frame = 0;
    const render = () => {
      frame = 0;
      const player = element("youtube-song-player");
      const media = player?.querySelector(".youtube-player-frame") || player;
      const playerBottom = (player?.offsetTop || 0) + (media?.offsetHeight || 0);
      const revealStart = Math.max(1, playerBottom - 58);
      const progress = Math.min(1, Math.max(0, (detail.scrollTop - revealStart) / 36));
      detail.style.setProperty("--video-header-progress", progress.toFixed(4));
    };
    const onScroll = () => {
      if (!frame) frame = global.requestAnimationFrame(render);
    };
    detail.addEventListener("scroll", onScroll, { passive: true });
    global.addEventListener("resize", onScroll, { passive: true });
    render();
    detailScrollCleanup = () => {
      detail.removeEventListener("scroll", onScroll);
      global.removeEventListener("resize", onScroll);
      if (frame) global.cancelAnimationFrame(frame);
    };
  }

  function watchIframeInteraction(container) {
    activePlayerContainer = container;
    container.tabIndex = -1;
    iframeFocusHandler = () => global.setTimeout(() => {
      const active = global.document.activeElement;
      if (active?.tagName === "IFRAME" && container.contains(active)) showControls();
    }, 0);
    global.addEventListener("blur", iframeFocusHandler);
  }

  function attachFloatingDrag(container, handle) {
    let drag = null;
    handle.addEventListener("pointerdown", (event) => {
      if (!floating || event.target.closest("button,a")) return;
      const rect = container.getBoundingClientRect();
      drag = { startX: event.clientX, startY: event.clientY, baseX: floatingOffset.x, baseY: floatingOffset.y, rect };
      container.classList.add("is-dragging");
      handle.setPointerCapture?.(event.pointerId);
      event.preventDefault();
    });
    handle.addEventListener("pointermove", (event) => {
      if (!drag) return;
      const proposedX = drag.baseX + event.clientX - drag.startX;
      const proposedY = drag.baseY + event.clientY - drag.startY;
      const minX = 8 - drag.rect.left + drag.baseX;
      const maxX = global.innerWidth - 8 - drag.rect.right + drag.baseX;
      const minY = 8 - drag.rect.top + drag.baseY;
      const maxY = global.innerHeight - 8 - drag.rect.bottom + drag.baseY;
      floatingOffset.x = Math.min(maxX, Math.max(minX, proposedX));
      floatingOffset.y = Math.min(maxY, Math.max(minY, proposedY));
      container.style.transform = `translate3d(${floatingOffset.x}px,${floatingOffset.y}px,0)`;
    });
    const finish = () => { drag = null; container.classList.remove("is-dragging"); };
    handle.addEventListener("pointerup", finish);
    handle.addEventListener("pointercancel", finish);
  }

  function toggleFloating() {
    const container = element("youtube-song-player");
    if (!container) return;
    floating = !floating;
    if (floating) {
      playerHome = container.parentNode;
      playerNextSibling = container.nextSibling;
      global.document.body.appendChild(container);
      container.classList.add("is-floating");
    } else resetFloating(container);
    const action = container.querySelector("[data-player-action='floating']");
    if (action) {
      action.querySelector("span:last-child").textContent = floating ? "Restaurar" : "Miniplayer";
      action.setAttribute("aria-label", floating ? "Restaurar player" : "Ativar miniplayer flutuante");
    }
    showControls();
  }

  function createAction(icon, label, actionName, handler, ariaLabel) {
    const action = button("", "youtube-player-action", handler, ariaLabel || label);
    action.dataset.playerAction = actionName;
    action.append(
      Object.assign(global.document.createElement("span"), { className: "youtube-player-action-icon", textContent: icon }),
      Object.assign(global.document.createElement("span"), { textContent: label })
    );
    return action;
  }

  function handleRepeatAction(status, repeatAction) {
    if (global.youtubePlayer.getSegmentLoop()) {
      global.youtubePlayer.clearSegmentLoop();
      repeatAction.classList.remove("is-active");
      closeRepeatPanel();
      status.textContent = "Player pronto";
      showControls();
      return;
    }
    if (repeatPanel) {
      closeRepeatPanel();
      showControls();
      return;
    }
    openRepeatPanel(status, repeatAction);
    showControls();
  }

  function openRepeatPanel(status, repeatAction) {
    closeRepeatPanel();
    const duration = global.youtubePlayer.getDuration();
    if (duration < 2) {
      context.showToast("Aguarde o vídeo carregar para selecionar o trecho.");
      showControls();
      return;
    }
    const saved = global.youtubePlayer.getSegmentLoop();
    const current = Math.min(duration - 1, global.youtubePlayer.getCurrentTime());
    let start = saved?.start ?? Math.max(0, Math.floor(current));
    let end = saved?.end ?? Math.min(duration, Math.max(start + 15, 15));
    if (end <= start + 1) start = Math.max(0, end - 15);

    const panel = global.document.createElement("section");
    panel.className = "youtube-repeat-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Selecionar trecho para repetir");
    const header = global.document.createElement("div");
    header.className = "youtube-repeat-header";
    const toggle = button("↶", "youtube-repeat-toggle", () => {
      if (global.youtubePlayer.getSegmentLoop()) {
        global.youtubePlayer.clearSegmentLoop();
        repeatAction.classList.remove("is-active");
        toggle.classList.remove("is-active");
        toggle.setAttribute("aria-label", "Ativar repetição do trecho");
        status.textContent = "Player pronto";
      } else {
        try {
          global.youtubePlayer.setSegmentLoop(start, end);
          repeatAction.classList.add("is-active");
          toggle.classList.add("is-active");
          toggle.setAttribute("aria-label", "Desativar repetição do trecho");
          status.textContent = `Repetindo ${formatTime(start)}–${formatTime(end)}`;
        } catch (error) { context.showToast(readableError(error)); }
      }
      showControls();
    }, saved ? "Desativar repetição do trecho" : "Ativar repetição do trecho");
    toggle.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.2 8.2A6.5 6.5 0 1 1 5.7 14"/><path d="M7.2 4.8v3.4H3.8"/></svg>';
    if (saved) toggle.classList.add("is-active");
    const closePanel = button("×", "youtube-repeat-icon-btn", () => { closeRepeatPanel(); showControls(); }, "Fechar seleção");
    closePanel.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7.5 7.5 9 9m0-9-9 9"/></svg>';
    header.append(toggle, Object.assign(global.document.createElement("strong"), { textContent: "Selecione o trecho" }), closePanel);
    const timeline = global.document.createElement("div");
    timeline.className = "youtube-repeat-timeline";
    const startLabel = global.document.createElement("span");
    const endLabel = global.document.createElement("span");
    const ranges = global.document.createElement("div");
    ranges.className = "youtube-repeat-ranges";
    const startInput = global.document.createElement("input");
    const endInput = global.document.createElement("input");
    [startInput, endInput].forEach((input) => { input.type = "range"; input.min = "0"; input.max = String(Math.floor(duration)); input.step = "1"; });
    startInput.value = String(Math.floor(start));
    endInput.value = String(Math.ceil(end));
    const update = (source) => {
      start = Number(startInput.value);
      end = Number(endInput.value);
      if (source === startInput && start >= end) startInput.value = String(start = Math.max(0, end - 1));
      if (source === endInput && end <= start) endInput.value = String(end = Math.min(duration, start + 1));
      startLabel.textContent = formatTime(start);
      endLabel.textContent = formatTime(end);
      ranges.style.setProperty("--loop-start", `${start / duration * 100}%`);
      ranges.style.setProperty("--loop-end", `${end / duration * 100}%`);
      if (source && global.youtubePlayer.getSegmentLoop()) {
        global.youtubePlayer.clearSegmentLoop();
        repeatAction.classList.remove("is-active");
        toggle.classList.remove("is-active");
        toggle.setAttribute("aria-label", "Ativar repetição do trecho");
        status.textContent = "Player pronto";
      }
    };
    startInput.addEventListener("input", () => update(startInput));
    endInput.addEventListener("input", () => update(endInput));
    ranges.append(startInput, endInput);
    timeline.append(startLabel, ranges, endLabel);
    panel.append(header, timeline);
    global.document.body.appendChild(panel);
    repeatPanel = panel;
    update();
  }

  function renderResults(container, videos) {
    const results = global.document.createElement("div");
    results.className = "youtube-song-results";
    videos.forEach((video, index) => {
      const row = global.document.createElement("button");
      row.type = "button";
      row.className = "youtube-song-result";
      row.setAttribute("aria-label", `Selecionar e abrir ${video.title}`);
      row.addEventListener("click", () => selectVideo(index));
      row.appendChild(imageFor(video, "youtube-song-result-cover"));
      const info = global.document.createElement("div");
      info.className = "youtube-song-result-info";
      const title = global.document.createElement("strong");
      title.textContent = video.title;
      const channel = global.document.createElement("span");
      const published = video.publishedAt ? new Date(video.publishedAt).getFullYear() : "";
      channel.textContent = [video.youtubeChannelTitle || video.artist || "YouTube", published].filter(Boolean).join(" · ");
      info.append(title, channel);
      const more = global.document.createElement("span");
      more.className = "youtube-song-result-more";
      more.setAttribute("aria-hidden", "true");
      more.textContent = "⋮";
      row.append(info, more);
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
    const shouldStartPaused = openSelectedVideoPaused;
    openSelectedVideoPaused = false;
    container.className = "youtube-player-shell is-linked is-expanded";
    playerTop(container);
    const status = global.document.createElement("small");
    status.className = "youtube-player-status is-visually-hidden";
    status.setAttribute("aria-live", "polite");
    status.textContent = "Carregando player…";
    const frame = global.document.createElement("div");
    frame.id = "youtube-iframe-player";
    frame.className = "youtube-player-frame";
    const actions = global.document.createElement("nav");
    actions.className = "youtube-player-actions is-visible";
    actions.setAttribute("aria-label", "Opções do vídeo");
    const repeat = createAction("↻", "Repetir trecho", "repeat", () => handleRepeatAction(status, repeat));
    const mini = createAction("▱", "Miniplayer", "floating", toggleFloating, "Ativar miniplayer flutuante");
    const close = createAction("×", "Fechar", "close", closeExpanded, "Fechar vídeo");
    actions.append(repeat, mini, close);
    const grip = global.document.createElement("div");
    grip.className = "youtube-player-floating-grip";
    grip.setAttribute("aria-label", "Arrastar miniplayer");
    grip.textContent = "⠿";
    controlsElement = actions;
    container.append(frame, actions, grip, status);
    attachFloatingDrag(container, grip);
    watchIframeInteraction(container);
    setupDetailScrollMotion();
    showControls();
    global.requestAnimationFrame(() => {
      global.youtubePlayer.mount("youtube-iframe-player", song.youtubeVideoId, {
        autoplay: !shouldStartPaused,
        onReady() { status.textContent = "Player pronto"; showControls(); },
        onStateChange(event) {
          const labels = { "-1": "Player pronto", 0: "Vídeo finalizado", 1: "Reproduzindo", 2: "Pausado", 3: "Carregando…", 5: "Player pronto" };
          if (!global.youtubePlayer.getSegmentLoop()) status.textContent = labels[event.data] || status.textContent;
          showControls();
        },
        onError() {
          global.setTimeout(() => recoverUnavailableVideo(song), 0);
        }
      }).catch((error) => recoverUnavailableVideo(song, readableError(error)));
    });
  }

  function renderSearch(container, message) {
    container.className = "youtube-player-shell is-search";
    container.style.removeProperty("top");
    const row = global.document.createElement("div");
    row.className = "youtube-player-search";
    const brand = global.document.createElement("span");
    brand.className = "youtube-search-brand";
    brand.innerHTML = '<svg viewBox="0 0 28 20" aria-hidden="true"><rect x="0" y="1" width="28" height="18" rx="5"/><path d="m11 6 7 4-7 4Z"/></svg><strong>YouTube</strong>';
    const input = global.document.createElement("input");
    input.id = "youtube-song-search-input";
    input.type = "search";
    input.placeholder = "Música ou artista";
    input.value = global.youtubeSongLinker.searchQuery(getSong());
    input.addEventListener("input", scheduleSearch);
    input.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      search();
    });
    const searchButton = button("", "youtube-song-search-btn", search, "Pesquisar vídeo no YouTube");
    searchButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/></svg>';
    row.append(brand, input, searchButton);
    container.append(row);
    if (message) {
      const status = global.document.createElement("div");
      status.className = "youtube-song-search-status";
      status.setAttribute("role", "status");
      status.setAttribute("aria-live", "polite");
      status.textContent = message;
      container.append(status);
    }
    if (currentVideos.length) renderResults(container, currentVideos);
  }

  function setSearchBusy(message, busy) {
    const container = element("youtube-song-player");
    if (!container) return;
    let status = container.querySelector(".youtube-song-search-status");
    if (!status) {
      status = global.document.createElement("div");
      status.className = "youtube-song-search-status";
      status.setAttribute("role", "status");
      status.setAttribute("aria-live", "polite");
      container.append(status);
    }
    status.textContent = message || "";
    status.hidden = !message;
    container.setAttribute("aria-busy", busy ? "true" : "false");
    const searchButton = container.querySelector(".youtube-song-search-btn");
    if (searchButton) searchButton.disabled = Boolean(busy);
  }

  function render(message) {
    const container = element("youtube-song-player");
    const song = getSong();
    if (!container || !song) return;
    cleanupPlayerUi(container);
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
    expanded = Boolean(song?.youtubeVideoId);
    openSelectedVideoPaused = expanded;
    requestVersion += 1;
    render();
  }

  function hide() {
    currentSongId = null;
    currentVideos = [];
    manualMode = false;
    expanded = false;
    openSelectedVideoPaused = false;
    requestVersion += 1;
    clearTimeout(searchTimer);
    if (requestController) requestController.abort();
    requestController = null;
    global.youtubePlayer.destroy();
    const container = element("youtube-song-player");
    cleanupPlayerUi(container);
    if (container) { clear(container); container.className = "youtube-player-shell"; container.style.removeProperty("top"); }
  }

  function openExpanded() { expanded = true; render(); }
  function closeExpanded() {
    global.youtubePlayer.pause();
    currentVideos = [];
    manualMode = true;
    expanded = false;
    render("Pesquise outra gravação para estudar.");
  }
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
  async function search({ isCurrent = () => true } = {}) {
    clearTimeout(searchTimer);
    searchTimer = null;
    const input = element("youtube-song-search-input");
    const query = input ? input.value.trim() : "";
    if (query.length < 3) {
      setSearchBusy("Digite pelo menos 3 caracteres.", false);
      return { ok: false, reason: 'query-too-short' };
    }
    const version = ++requestVersion;
    if (requestController) requestController.abort();
    requestController = new AbortController();
    setSearchBusy("Pesquisando no YouTube…", true);
    try {
      const videos = await global.youtubeApi.searchVideos(query, 8, { signal: requestController.signal });
      if (version !== requestVersion || !getSong() || !isCurrent()) return { ok: false, reason: 'context-changed' };
      currentVideos = videos;
      if (excludedVideoId) currentVideos = currentVideos.filter((video) => String(video.youtubeVideoId || "") !== excludedVideoId);
      if (version === requestVersion && getSong()) render(currentVideos.length ? "Selecione a gravação correta." : "Nenhum vídeo encontrado.");
      return { ok: true, count: currentVideos.length };
    } catch (error) {
      if (version === requestVersion && error?.name !== "AbortError") render(readableError(error));
      return { ok: false, reason: error?.name === 'AbortError' ? 'cancelled' : 'search-failed' };
    }
  }
  function selectVideo(index) {
    const video = currentVideos[index];
    if (!video) return;
    persistLink(video);
    excludedVideoId = null;
    currentVideos = [];
    manualMode = false;
    expanded = true;
    openSelectedVideoPaused = true;
    context.showToast("Música vinculada ao YouTube");
    render();
  }
  function initialize(options) { context = options; }

  async function searchFromVoice(query, isCurrent = () => true) {
    if (!getSong() || !isCurrent()) return { ok: false, reason: 'context-changed' };
    showManualSearch();
    const input = element('youtube-song-search-input');
    if (!input) return { ok: false, reason: 'search-unavailable' };
    input.value = String(query || '').trim();
    return search({ isCurrent });
  }
  global.youtubePlayerUI = Object.freeze({ initialize, showSong, hide, search, searchFromVoice, scheduleSearch, selectVideo, openExpanded, closeExpanded });
})(window);
