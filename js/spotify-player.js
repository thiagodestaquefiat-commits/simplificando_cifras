(function (global) {
  "use strict";

  const SDK_URL = "https://sdk.scdn.co/spotify-player.js";
  const listeners = new Set();
  let sdkPromise = null;
  let playerPromise = null;
  let player = null;
  let deviceId = null;
  let selectedSong = null;
  let activeUri = null;
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

  function loadSdk() {
    if (global.Spotify && global.Spotify.Player) return Promise.resolve(global.Spotify);
    if (sdkPromise) return sdkPromise;
    sdkPromise = new Promise((resolve, reject) => {
      const previousReady = global.onSpotifyWebPlaybackSDKReady;
      global.onSpotifyWebPlaybackSDKReady = () => {
        if (typeof previousReady === "function") previousReady();
        if (global.Spotify && global.Spotify.Player) resolve(global.Spotify);
        else reject(new Error("O Web Playback SDK não ficou disponível."));
      };
      const existing = global.document.querySelector('script[src="' + SDK_URL + '"]');
      const script = existing || global.document.createElement("script");
      if (!existing) {
        script.src = SDK_URL;
        script.async = true;
        global.document.head.appendChild(script);
      }
      script.addEventListener("error", () => reject(new Error("Não foi possível carregar o Web Playback SDK do Spotify.")), { once: true });
    });
    return sdkPromise;
  }

  function errorMessage(kind, fallback) {
    if (kind === "account") return "A reprodução completa requer uma conta Spotify Premium autorizada neste aplicativo.";
    if (kind === "authentication") return "A sessão do Spotify expirou. Desconecte e conecte novamente.";
    if (kind === "initialization") return "Este navegador não conseguiu iniciar a reprodução protegida do Spotify.";
    return fallback || "O Spotify não conseguiu reproduzir esta música.";
  }

  function handlePlayerState(playbackState) {
    if (!playbackState) {
      publish({ status: "ready", paused: true, message: "Player disponível" });
      return;
    }
    const currentTrack = playbackState.track_window && playbackState.track_window.current_track;
    const currentUri = currentTrack && currentTrack.uri || null;
    if (selectedSong && currentUri && currentUri !== selectedSong.spotifyUri) return;
    activeUri = currentUri || activeUri;
    repeatEnabled = Number(playbackState.repeat_mode) === 2;
    publish({
      status: "ready",
      paused: Boolean(playbackState.paused),
      spotifyUri: currentUri || (selectedSong && selectedSong.spotifyUri) || null,
      position: Number(playbackState.position) || 0,
      duration: Number(playbackState.duration) || Number(selectedSong && selectedSong.duration) || 0,
      repeatMode: repeatEnabled ? 2 : 0,
      hasStarted: Boolean(currentUri),
      message: playbackState.paused ? "Pausado" : "Tocando agora"
    });
  }

  function bindPlayerEvents(instance, resolve, reject) {
    let ready = false;
    instance.addListener("ready", ({ device_id: readyDeviceId }) => {
      ready = true;
      deviceId = readyDeviceId;
      publish({ status: "ready", paused: true, message: "Player Premium pronto" });
      resolve(instance);
    });
    instance.addListener("not_ready", ({ device_id: unavailableDeviceId }) => {
      if (!deviceId || unavailableDeviceId === deviceId) deviceId = null;
      publish({ status: "error", paused: true, message: "O dispositivo Spotify ficou indisponível. Reabra a música para reconectar." });
    });
    instance.addListener("player_state_changed", handlePlayerState);
    ["initialization", "authentication", "account", "playback"].forEach((kind) => {
      instance.addListener(kind + "_error", ({ message }) => {
        const readable = errorMessage(kind, message);
        publish({ status: "error", paused: true, message: readable });
        if (!ready) reject(new Error(readable));
      });
    });
    instance.addListener("autoplay_failed", () => {
      publish({ status: "ready", paused: true, message: "Toque em play novamente para liberar o áudio neste navegador." });
    });
  }

  function ensurePlayer() {
    if (playerPromise) return playerPromise;
    if (!global.spotifyAuth || !global.spotifyAuth.isAuthenticated()) {
      return Promise.reject(new Error("Conecte sua conta Spotify para continuar."));
    }
    publish({ status: "loading", message: "Preparando reprodução completa…" });
    playerPromise = loadSdk().then((Spotify) => new Promise((resolve, reject) => {
      player = new Spotify.Player({
        name: "Simplificando Cifras",
        getOAuthToken(callback) {
          global.spotifyAuth.getAccessToken()
            .then(callback)
            .catch((error) => publish({ status: "error", message: error.message }));
        },
        volume: 0.8,
        enableMediaSession: true
      });
      bindPlayerEvents(player, resolve, reject);
      Promise.resolve(player.connect()).then((connected) => {
        if (!connected) reject(new Error("O Spotify não conseguiu criar o dispositivo de reprodução no navegador."));
      }).catch(reject);
    })).catch((error) => {
      playerPromise = null;
      player = null;
      deviceId = null;
      publish({ status: "error", paused: true, message: error.message });
      throw error;
    });
    return playerPromise;
  }

  async function prepare(song) {
    if (!song || !song.spotifyUri) throw new Error("Esta música ainda não está vinculada ao Spotify.");
    const changed = !selectedSong || selectedSong.spotifyUri !== song.spotifyUri;
    selectedSong = song;
    if (changed) {
      publish({
        status: "loading",
        paused: true,
        spotifyUri: song.spotifyUri,
        position: 0,
        duration: Number(song.duration) || 0,
        repeatMode: 0,
        hasStarted: false,
        message: "Preparando reprodução completa…"
      });
    }
    return ensurePlayer();
  }

  function activate() {
    if (player && typeof player.activateElement === "function") return Promise.resolve(player.activateElement());
    return ensurePlayer().then((readyPlayer) => {
      if (typeof readyPlayer.activateElement === "function") return readyPlayer.activateElement();
      return true;
    });
  }

  function setNativeVisible() {
    // Mantido por compatibilidade com a interface. O Web Playback SDK não
    // precisa de um iframe oficial visível ou escondido.
  }

  async function performToggle(song) {
    if (!song || !song.spotifyUri) throw new Error("Esta música ainda não está vinculada ao Spotify.");
    selectedSong = song;
    if (player && typeof player.activateElement === "function") player.activateElement();
    const readyPlayer = await ensurePlayer();
    if (!deviceId) throw new Error("O dispositivo Spotify ainda não está pronto. Tente novamente em alguns segundos.");

    if (activeUri === song.spotifyUri && state.hasStarted) {
      const resume = state.paused;
      publish({ status: "loading", message: resume ? "Retomando reprodução…" : "Pausando…" });
      if (resume) await readyPlayer.resume();
      else await readyPlayer.pause();
      publish({ status: "ready", paused: !resume, message: resume ? "Tocando agora" : "Pausado" });
      return;
    }

    publish({
      status: "loading",
      paused: false,
      spotifyUri: song.spotifyUri,
      position: 0,
      duration: Number(song.duration) || 0,
      hasStarted: false,
      message: "Iniciando música completa…"
    });
    await global.spotifyApi.startPlayback(deviceId, song.spotifyUri);
    activeUri = song.spotifyUri;
    publish({ paused: false, hasStarted: true, message: "Tocando agora" });
  }

  function toggle(song) {
    if (operationPromise) return operationPromise;
    operationPromise = performToggle(song).finally(() => { operationPromise = null; });
    return operationPromise;
  }

  async function seek(position) {
    await ensurePlayer();
    if (!deviceId || !selectedSong || !selectedSong.spotifyUri) throw new Error("O dispositivo Spotify ainda não está pronto.");
    const target = Math.max(0, Math.min(Number(position) || 0, state.duration || Number.MAX_SAFE_INTEGER));
    const wasPlaying = state.paused === false;
    publish({ status: "loading", message: "Ajustando posição…" });
    if (wasPlaying) {
      // Reiniciar a mesma URI na nova posição força o navegador a reconstruir
      // o fluxo de áudio protegido. O seek local do SDK pode manter o relógio
      // avançando sem áudio em alguns ambientes.
      await global.spotifyApi.startPlayback(deviceId, selectedSong.spotifyUri, target);
      activeUri = selectedSong.spotifyUri;
    } else {
      await global.spotifyApi.seekPlayback(deviceId, target);
    }
    publish({ status: "ready", position: target, paused: !wasPlaying, hasStarted: true, message: wasPlaying ? "Tocando agora" : "Pausado" });
  }

  function skip(seconds) {
    const elapsed = state.paused ? state.position : state.position + Math.max(0, Date.now() - (state.updatedAt || Date.now()));
    return seek(elapsed + Number(seconds || 0) * 1000);
  }

  async function setRepeat(enabled) {
    await ensurePlayer();
    if (!deviceId) throw new Error("O dispositivo Spotify ainda não está pronto.");
    repeatEnabled = Boolean(enabled);
    await global.spotifyApi.setRepeatMode(deviceId, repeatEnabled);
    publish({ repeatMode: repeatEnabled ? 2 : 0, message: repeatEnabled ? "Repetição ativada" : "Repetição desativada" });
  }

  global.spotifyPlayer = Object.freeze({ prepare, subscribe, activate, setNativeVisible, toggle, seek, skip, setRepeat });
})(window);
