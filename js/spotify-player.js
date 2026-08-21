(function (global) {
  "use strict";

  const IFRAME_API_URL = "https://open.spotify.com/embed/iframe-api/v1";
  const listeners = new Set();
  let apiPromise = null;
  let controllerPromise = null;
  let controller = null;
  let loadedUri = null;
  let operationPromise = null;
  let repeatEnabled = false;
  let state = { status: "idle", paused: true, spotifyUri: null, position: 0, duration: 0, repeatMode: 0, hasStarted: false, message: "" };

  function publish(changes) {
    state = { ...state, ...(changes || {}), updatedAt: Date.now() };
    listeners.forEach((listener) => listener({ ...state }));
  }

  function subscribe(listener) {
    listeners.add(listener);
    listener({ ...state });
    return () => listeners.delete(listener);
  }

  function loadApi() {
    if (global.SpotifyIframeApi) return Promise.resolve(global.SpotifyIframeApi);
    if (apiPromise) return apiPromise;
    apiPromise = new Promise((resolve, reject) => {
      const previousReady = global.onSpotifyIframeApiReady;
      global.onSpotifyIframeApiReady = (iframeApi) => {
        global.SpotifyIframeApi = iframeApi;
        if (typeof previousReady === "function") previousReady(iframeApi);
        resolve(iframeApi);
      };
      const existing = global.document.querySelector('script[src="' + IFRAME_API_URL + '"]');
      const script = existing || global.document.createElement("script");
      if (!existing) {
        script.src = IFRAME_API_URL;
        script.async = true;
        global.document.head.appendChild(script);
      }
      script.addEventListener("error", () => reject(new Error("Não foi possível carregar o player incorporado do Spotify.")), { once: true });
    });
    return apiPromise;
  }

  function createHost() {
    let wrapper = global.document.getElementById("spotify-embed-engine");
    if (wrapper) return global.document.getElementById("spotify-embed-mount");
    wrapper = global.document.createElement("div");
    wrapper.id = "spotify-embed-engine";
    wrapper.setAttribute("aria-hidden", "true");
    const mount = global.document.createElement("div");
    mount.id = "spotify-embed-mount";
    wrapper.appendChild(mount);
    global.document.body.appendChild(wrapper);
    return mount;
  }

  function bindControllerEvents(embedController) {
    embedController.addListener("ready", () => publish({
      status: "ready",
      paused: true,
      spotifyUri: loadedUri,
      message: "Player pronto"
    }));
    embedController.addListener("playback_started", (event) => {
      publish({ status: "ready", paused: false, hasStarted: true, spotifyUri: event.data && event.data.playingURI || loadedUri, message: "Tocando agora" });
    });
    embedController.addListener("playback_update", (event) => {
      const data = event.data || {};
      const duration = Number(data.duration) || 0;
      const position = Number(data.position) || 0;
      if (repeatEnabled && duration > 0 && position >= duration - 500) {
        embedController.restart();
      }
      publish({
        status: data.isBuffering ? "loading" : "ready",
        paused: Boolean(data.isPaused),
        spotifyUri: data.playingURI || loadedUri,
        position,
        duration,
        repeatMode: repeatEnabled ? 2 : 0,
        message: data.isBuffering ? "Carregando…" : (data.isPaused ? "Pausado" : "Tocando agora")
      });
    });
  }

  async function ensureController(song) {
    if (!song || !song.spotifyUri) throw new Error("Esta música ainda não está vinculada ao Spotify.");
    if (!controllerPromise) {
      publish({ status: "loading", message: "Preparando o player…" });
      controllerPromise = loadApi().then((iframeApi) => new Promise((resolve) => {
        iframeApi.createController(createHost(), {
          uri: song.spotifyUri,
          width: "100%",
          height: 80
        }, (embedController) => {
          controller = embedController;
          loadedUri = song.spotifyUri;
          bindControllerEvents(embedController);
          resolve(embedController);
        });
      })).catch((error) => {
        controllerPromise = null;
        publish({ status: "error", message: error.message });
        throw error;
      });
    }
    const readyController = await controllerPromise;
    if (loadedUri !== song.spotifyUri) {
      loadedUri = song.spotifyUri;
      publish({ status: "loading", paused: true, hasStarted: false, spotifyUri: song.spotifyUri, position: 0, duration: Number(song.duration) || 0, message: "Carregando música…" });
      readyController.loadEntity(song.spotifyUri);
    }
    return readyController;
  }

  function prepare(song) {
    return ensureController(song);
  }

  function activate() {
    return Promise.resolve(true);
  }

  function setNativeVisible(visible) {
    const host = global.document.getElementById("spotify-embed-engine");
    if (!host) return;
    host.classList.toggle("is-visible", Boolean(visible));
    host.setAttribute("aria-hidden", visible ? "false" : "true");
  }

  function commandToggle(readyController) {
    publish({ status: "loading", message: state.paused === false ? "Pausando…" : "Iniciando reprodução…" });
    if (typeof readyController.togglePlay === "function") readyController.togglePlay();
    else if (state.paused === false) readyController.pause();
    else readyController.play();
  }

  function performToggle(song) {
    if (!song || !song.spotifyUri) return Promise.reject(new Error("Esta música ainda não está vinculada ao Spotify."));

    // A música é preparada ao abrir os detalhes. Neste caminho o comando fica
    // dentro do clique do usuário, requisito das políticas de autoplay.
    if (controller && loadedUri === song.spotifyUri) {
      commandToggle(controller);
      return Promise.resolve();
    }

    return ensureController(song).then((readyController) => commandToggle(readyController));
  }

  function toggle(song) {
    if (operationPromise) return operationPromise;
    operationPromise = performToggle(song).finally(() => { operationPromise = null; });
    return operationPromise;
  }

  async function seek(position) {
    if (!controller) throw new Error("Abra uma música antes de buscar uma posição.");
    const target = Math.max(0, Math.min(Number(position) || 0, state.duration || Number.MAX_SAFE_INTEGER));
    controller.seek(Math.round(target / 1000));
    publish({ position: target });
  }

  function skip(seconds) {
    const elapsed = state.paused ? state.position : state.position + Math.max(0, Date.now() - (state.updatedAt || Date.now()));
    return seek(elapsed + Number(seconds || 0) * 1000);
  }

  function setRepeat(enabled) {
    repeatEnabled = Boolean(enabled);
    publish({ repeatMode: repeatEnabled ? 2 : 0, message: repeatEnabled ? "Repetição ativada" : "Repetição desativada" });
    return Promise.resolve();
  }

  global.spotifyPlayer = Object.freeze({ prepare, subscribe, activate, setNativeVisible, toggle, seek, skip, setRepeat });
})(window);
