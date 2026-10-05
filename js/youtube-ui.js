(function (global) {
  "use strict";

  let appContext = null;
  let currentResults = [];
  let searchTimer = null;
  let searchVersion = 0;
  let requestController = null;
  const SEARCH_DEBOUNCE_MS = 700;
  const MIN_LIVE_SEARCH_LENGTH = 3;

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function resultsElement() { return document.getElementById("youtube-results"); }

  function closeResults() {
    const container = resultsElement();
    const button = document.getElementById("youtube-search-btn");
    clearTimeout(searchTimer);
    searchTimer = null;
    searchVersion += 1;
    if (requestController) requestController.abort();
    requestController = null;
    currentResults = [];
    if (button) { button.disabled = false; button.textContent = "Pesquisar"; }
    if (!container) return;
    container.replaceChildren();
    container.style.display = "none";
  }

  function renderMessage(message, type) {
    const container = resultsElement();
    if (!container) return;
    container.replaceChildren();
    container.style.display = "block";
    container.appendChild(element("div", `youtube-message ${type || ""}`, message));
  }

  function friendlyRequestError(error) {
    if (error && error.name === "AbortError") return "";
    if (error?.status === 429) return "O limite temporário de buscas do YouTube foi atingido. Tente novamente mais tarde.";
    if (error?.status === 503) return error.message || "A busca do YouTube ainda não está disponível.";
    return error?.message || "O YouTube não conseguiu concluir a busca.";
  }

  function isAlreadyAdded(video) {
    if (!appContext || !video) return false;
    try {
      const candidate = global.songModel.create(video);
      return Boolean(global.songModel.findDuplicate(appContext.getSongs(), candidate));
    } catch (_) {
      return false;
    }
  }

  function addIconMarkup() {
    return '<svg class="youtube-add-btn-icon youtube-add-btn-icon--plus" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.25"></circle><path d="M12 8v8M8 12h8"></path></svg><svg class="youtube-add-btn-icon youtube-add-btn-icon--check" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><path d="m7.6 12.2 2.8 2.8 6.2-6.3" fill="none"></path></svg>';
  }

  function setAddButtonState(button, video, added, animate) {
    const title = String(video?.title || "Música").trim();
    button.classList.toggle("is-added", added);
    button.classList.toggle("is-confirming", Boolean(added && animate));
    button.setAttribute("aria-pressed", String(added));
    button.setAttribute("aria-label", added ? `“${title}” adicionada à playlist` : `Adicionar “${title}” à playlist`);
    button.disabled = added;
    if (animate) {
      const animatedIcon = button.querySelector(added ? ".youtube-add-btn-icon--check" : ".youtube-add-btn-icon--plus");
      animatedIcon?.addEventListener("animationend", () => button.classList.remove("is-confirming", "is-reverting"), { once: true });
    }
  }

  function renderResults(videos) {
    const container = resultsElement();
    if (!container) return;
    container.replaceChildren();
    container.style.display = "block";
    if (!videos.length) {
      renderMessage("Nenhum vídeo foi encontrado no YouTube.", "empty");
      return;
    }
    container.appendChild(element("div", "youtube-results-title", "Resultados do YouTube"));
    videos.forEach((video, index) => {
      const row = element("div", "youtube-video-result");
      const cover = element("img", "youtube-video-cover");
      cover.src = video.coverUrl;
      cover.alt = "";
      cover.loading = "lazy";
      const info = element("div", "youtube-video-info");
      info.append(
        element("div", "youtube-video-title", video.title),
        element("div", "youtube-video-channel", video.youtubeChannelTitle || video.artist || "YouTube")
      );
      const addButton = element("button", "youtube-add-btn");
      addButton.type = "button";
      addButton.innerHTML = addIconMarkup();
      setAddButtonState(addButton, video, isAlreadyAdded(video), false);
      addButton.addEventListener("pointerdown", () => addButton.classList.add("is-pressed"));
      ["pointerup", "pointercancel", "pointerleave"].forEach(type => addButton.addEventListener(type, () => addButton.classList.remove("is-pressed")));
      addButton.addEventListener("click", () => addVideo(index, addButton));
      row.append(cover, info, addButton);
      container.appendChild(row);
    });
  }

  async function performSearch(cleaned, version) {
    const button = document.getElementById("youtube-search-btn");
    if (requestController) requestController.abort();
    requestController = new AbortController();
    if (button) { button.disabled = true; button.textContent = "Buscando…"; }
    renderMessage("Pesquisando no YouTube…", "loading");
    try {
      const videos = await global.youtubeApi.searchVideos(cleaned, 8, { signal: requestController.signal });
      if (version !== searchVersion) return;
      currentResults = videos;
      renderResults(videos);
    } catch (error) {
      if (version !== searchVersion || error?.name === "AbortError") return;
      renderMessage(friendlyRequestError(error), "error");
    } finally {
      if (version === searchVersion && button) { button.disabled = false; button.textContent = "Pesquisar"; }
    }
  }

  function scheduleSearch() {
    const input = document.getElementById("youtube-input");
    const cleaned = String(input ? input.value : "").trim();
    clearTimeout(searchTimer);
    searchVersion += 1;
    const version = searchVersion;
    if (cleaned.length < MIN_LIVE_SEARCH_LENGTH) { closeResults(); return; }
    searchTimer = setTimeout(() => {
      searchTimer = null;
      performSearch(cleaned, version);
    }, SEARCH_DEBOUNCE_MS);
  }

  function search(query) {
    const input = document.getElementById("youtube-input");
    const cleaned = String(query !== undefined ? query : (input ? input.value : "")).trim();
    clearTimeout(searchTimer);
    searchTimer = null;
    if (cleaned.length < MIN_LIVE_SEARCH_LENGTH) { closeResults(); return Promise.resolve(); }
    if (input) input.value = cleaned;
    searchVersion += 1;
    return performSearch(cleaned, searchVersion);
  }

  function clearSearch() {
    const input = document.getElementById("youtube-input");
    if (input) {
      input.value = "";
      input.focus();
    }
    closeResults();
  }

  function addVideo(index, button) {
    const video = currentResults[index];
    if (!appContext || !video || button?.classList.contains("is-pending") || button?.classList.contains("is-added")) return;
    if (button) {
      button.classList.add("is-pending");
      setAddButtonState(button, video, true, true);
    }
    try {
      const result = global.songRepository.addOrReuse(appContext.getSongs(), video);
      appContext.setSongs(result.songs);
      appContext.save();
      appContext.renderSongs();
      if (button) button.classList.remove("is-pending");
      return result.song;
    } catch (error) {
      if (button) {
        button.classList.remove("is-pending", "is-confirming", "is-added");
        button.classList.add("is-reverting");
        setAddButtonState(button, video, false, true);
      }
      appContext.showToast(error?.message || "Não foi possível adicionar a música à playlist.");
      return null;
    }
  }

  function initialize(context) { appContext = context; }

  global.youtubeUI = Object.freeze({ initialize, search, scheduleSearch, searchFromInternal: search, clearSearch, addVideo, friendlyRequestError });
})(window);
