(function (global) {
  "use strict";

  let appContext = null;
  let currentResults = [];
  let searchTimer = null;
  let searchVersion = 0;
  const SEARCH_DEBOUNCE_MS = 350;
  const MIN_LIVE_SEARCH_LENGTH = 2;

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function resultsElement() {
    return document.getElementById("spotify-results");
  }

  function closeResults() {
    const container = resultsElement();
    const button = document.getElementById("spotify-search-btn");
    clearTimeout(searchTimer);
    searchTimer = null;
    searchVersion += 1;
    currentResults = [];
    if (button) {
      button.disabled = false;
      button.textContent = "Pesquisar";
    }
    if (!container) return;
    container.replaceChildren();
    container.style.display = "none";
  }

  function renderMessage(message, type) {
    const container = resultsElement();
    if (!container) return;
    container.replaceChildren();
    container.style.display = "block";
    container.appendChild(element("div", "spotify-message " + (type || ""), message));
  }

  function friendlyRequestError(error) {
    if (error?.status === 401) return "Sua sessão do Spotify expirou. Desconecte e conecte novamente.";
    if (error?.status === 403) return "O Spotify recusou o acesso (403). Confirme que você conectou a mesma conta proprietária do aplicativo e que ela possui Premium ativo.";
    if (error?.status === 429 && error?.reason === "QUOTA_EXCEEDED") return "A cota de desenvolvimento do Spotify foi atingida. Aguarde a renovação da cota para pesquisar novamente.";
    if (error?.status === 429) return "O limite temporário do Spotify foi atingido. Tente novamente em alguns instantes.";
    return error?.message || "O Spotify não conseguiu concluir a solicitação.";
  }

  function updateConnectionState() {
    const connected = global.spotifyAuth.isAuthenticated();
    const button = document.getElementById("spotify-auth-btn");
    const status = document.getElementById("spotify-status");
    if (button) button.textContent = connected ? "Desconectar" : "Conectar";
    if (status) {
      status.textContent = connected ? "Spotify conectado" : "Conecte para pesquisar músicas";
      status.classList.toggle("connected", connected);
    }
  }

  function renderResults(tracks) {
    const container = resultsElement();
    if (!container) return;
    container.replaceChildren();
    container.style.display = "block";

    if (!tracks.length) {
      renderMessage("Nenhuma música foi encontrada no Spotify.", "empty");
      return;
    }

    const heading = element("div", "spotify-results-title", "Resultados do Spotify");
    container.appendChild(heading);

    tracks.forEach((track, index) => {
      const row = element("div", "spotify-track");
      if (track.coverUrl) {
        const cover = element("img", "spotify-track-cover");
        cover.src = track.coverUrl;
        cover.alt = "";
        cover.loading = "lazy";
        row.appendChild(cover);
      } else {
        row.appendChild(element("div", "spotify-track-cover placeholder", "♫"));
      }

      const info = element("div", "spotify-track-info");
      info.appendChild(element("div", "spotify-track-title", track.title));
      info.appendChild(element("div", "spotify-track-sub", [track.artist, track.album].filter(Boolean).join(" · ")));
      row.appendChild(info);

      const addButton = element("button", "spotify-add-btn", "Adicionar");
      addButton.type = "button";
      addButton.addEventListener("click", () => addTrack(index));
      row.appendChild(addButton);
      container.appendChild(row);
    });
  }

  async function initialize(context) {
    appContext = context;
    try {
      const result = await global.spotifyAuth.handleCallback();
      if (result.handled && result.connected) appContext.showToast("✅ Spotify conectado!");
    } catch (error) {
      renderMessage(error.message, "error");
    }
    updateConnectionState();
  }

  async function toggleConnection() {
    if (global.spotifyAuth.isAuthenticated()) {
      global.spotifyAuth.disconnect();
      closeResults();
      updateConnectionState();
      appContext.showToast("Spotify desconectado desta sessão.");
      return;
    }
    try {
      await global.spotifyAuth.startAuthorization();
    } catch (error) {
      renderMessage(error.message, "error");
    }
  }

  async function performSearch(cleaned, version, connectIfNeeded) {
    if (!global.spotifyAuth.isAuthenticated()) {
      if (connectIfNeeded) {
        renderMessage("Conecte sua conta Spotify para pesquisar.", "empty");
        await toggleConnection();
      } else {
        closeResults();
      }
      return;
    }

    const button = document.getElementById("spotify-search-btn");
    if (button) {
      button.disabled = true;
      button.textContent = "Buscando…";
    }
    renderMessage("Pesquisando no Spotify…", "loading");

    try {
      const tracks = await global.spotifyApi.searchTracks(cleaned, 10);
      if (version !== searchVersion) return;
      currentResults = tracks;
      renderResults(currentResults);
    } catch (error) {
      if (version !== searchVersion) return;
      if (error.status === 401) {
        global.spotifyAuth.disconnect();
        updateConnectionState();
      }
      renderMessage(friendlyRequestError(error), "error");
    } finally {
      if (version === searchVersion && button) {
        button.disabled = false;
        button.textContent = "Pesquisar";
      }
    }
  }

  function scheduleSearch() {
    const input = document.getElementById("spotify-input");
    const cleaned = String(input ? input.value : "").trim();
    clearTimeout(searchTimer);
    searchVersion += 1;
    const version = searchVersion;

    if (cleaned.length < MIN_LIVE_SEARCH_LENGTH || !global.spotifyAuth.isAuthenticated()) {
      closeResults();
      return;
    }

    searchTimer = setTimeout(() => {
      searchTimer = null;
      performSearch(cleaned, version, false);
    }, SEARCH_DEBOUNCE_MS);
  }

  function search(query) {
    const input = document.getElementById("spotify-input");
    const cleaned = String(query !== undefined ? query : (input ? input.value : "")).trim();
    clearTimeout(searchTimer);
    searchTimer = null;
    if (!cleaned) {
      closeResults();
      return Promise.resolve();
    }
    if (input) input.value = cleaned;
    searchVersion += 1;
    return performSearch(cleaned, searchVersion, true);
  }

  function searchFromInternal(query) {
    return search(query);
  }

  function addTrack(index) {
    if (!appContext || !currentResults[index]) return;
    const result = global.songRepository.addOrReuse(appContext.getSongs(), currentResults[index]);
    appContext.setSongs(result.songs);
    appContext.save();
    appContext.renderSongs();
    appContext.showToast(result.created
      ? "✅ Música adicionada. A cifra pode ser cadastrada agora."
      : "ℹ️ A música já existia e seus metadados foram aproveitados.");
    closeResults();
    appContext.openSong(result.song.id);
  }

  global.spotifyUI = Object.freeze({ initialize, toggleConnection, search, scheduleSearch, searchFromInternal, addTrack, friendlyRequestError });
})(window);
