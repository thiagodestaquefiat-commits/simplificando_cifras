(function (global) {
  "use strict";

  const SDK_URL = "https://www.youtube.com/iframe_api";
  let sdkPromise = null;
  let player = null;
  let mountedVideoId = null;
  let segmentLoop = null;
  let segmentTimer = null;

  function stopSegmentTimer() {
    if (segmentTimer) global.clearInterval(segmentTimer);
    segmentTimer = null;
  }

  function clearSegmentLoop() {
    segmentLoop = null;
    stopSegmentTimer();
  }

  function monitorSegment() {
    stopSegmentTimer();
    segmentTimer = global.setInterval(() => {
      if (!player || !segmentLoop || typeof player.getCurrentTime !== "function") return;
      const current = Number(player.getCurrentTime());
      if (!Number.isFinite(current)) return;
      if (current >= segmentLoop.end - .08) {
        const ended = typeof player.getPlayerState === "function" && player.getPlayerState() === 0;
        player.seekTo(segmentLoop.start, true);
        if (ended && typeof player.playVideo === "function") player.playVideo();
      }
    }, 100);
  }

  function loadSdk() {
    if (global.YT && global.YT.Player) return Promise.resolve(global.YT);
    if (sdkPromise) return sdkPromise;
    sdkPromise = new Promise((resolve, reject) => {
      const previousReady = global.onYouTubeIframeAPIReady;
      global.onYouTubeIframeAPIReady = () => {
        if (typeof previousReady === "function") previousReady();
        if (global.YT && global.YT.Player) resolve(global.YT);
        else reject(new Error("O player do YouTube não ficou disponível."));
      };
      const existing = global.document.querySelector(`script[src="${SDK_URL}"]`);
      const script = existing || global.document.createElement("script");
      if (!existing) {
        script.src = SDK_URL;
        script.async = true;
        global.document.head.appendChild(script);
      }
      script.addEventListener("error", () => reject(new Error("Não foi possível carregar o player do YouTube.")), { once: true });
    });
    return sdkPromise;
  }

  function destroy() {
    clearSegmentLoop();
    if (player && typeof player.destroy === "function") player.destroy();
    player = null;
    mountedVideoId = null;
  }

  async function mount(elementId, videoId, events) {
    const cleaned = String(videoId || "").trim();
    if (!cleaned) throw new Error("Este vídeo do YouTube não está disponível.");
    destroy();
    const YT = await loadSdk();
    return new Promise((resolve, reject) => {
      let settled = false;
      player = new YT.Player(elementId, {
        width: "100%",
        height: "100%",
        videoId: cleaned,
        playerVars: {
          autoplay: 1,
          controls: 1,
          enablejsapi: 1,
          playsinline: 1,
          rel: 0,
          origin: global.location && global.location.origin ? global.location.origin : undefined
        },
        events: {
          onReady(event) {
            mountedVideoId = cleaned;
            settled = true;
            try { event.target.playVideo(); } catch (_) { /* O botão nativo continua disponível. */ }
            if (events && typeof events.onReady === "function") events.onReady(event);
            resolve(event.target);
          },
          onStateChange(event) {
            if (events && typeof events.onStateChange === "function") events.onStateChange(event);
          },
          onError(event) {
            if (events && typeof events.onError === "function") events.onError(event);
            if (!settled) reject(new Error("Este vídeo não pôde ser reproduzido no aplicativo."));
          }
        }
      });
    });
  }

  function pause() {
    if (player && typeof player.pauseVideo === "function") player.pauseVideo();
  }

  function play() {
    if (player && typeof player.playVideo === "function") player.playVideo();
  }

  function getDuration() {
    if (!player || typeof player.getDuration !== "function") return 0;
    return Number(player.getDuration()) || 0;
  }

  function getCurrentTime() {
    if (!player || typeof player.getCurrentTime !== "function") return 0;
    return Number(player.getCurrentTime()) || 0;
  }

  function setSegmentLoop(start, end) {
    const duration = getDuration();
    const safeStart = Math.max(0, Number(start) || 0);
    const safeEnd = Math.min(duration || Number(end), Number(end) || 0);
    if (!Number.isFinite(safeEnd) || safeEnd <= safeStart + .5) throw new Error("Selecione um trecho válido.");
    segmentLoop = { start: safeStart, end: safeEnd };
    if (getCurrentTime() < safeStart || getCurrentTime() >= safeEnd) player.seekTo(safeStart, true);
    play();
    monitorSegment();
    return { ...segmentLoop };
  }

  function getSegmentLoop() { return segmentLoop ? { ...segmentLoop } : null; }

  function currentVideoId() { return mountedVideoId; }

  global.youtubePlayer = Object.freeze({
    loadSdk, mount, play, pause, destroy, currentVideoId,
    getDuration, getCurrentTime, setSegmentLoop, clearSegmentLoop, getSegmentLoop
  });
})(window);
