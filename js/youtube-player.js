(function (global) {
  "use strict";

  const SDK_URL = "https://www.youtube.com/iframe_api";
  let sdkPromise = null;
  let player = null;
  let mountedVideoId = null;

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
          controls: 1,
          playsinline: 1,
          rel: 0,
          origin: global.location && global.location.origin ? global.location.origin : undefined
        },
        events: {
          onReady(event) {
            mountedVideoId = cleaned;
            settled = true;
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

  function currentVideoId() { return mountedVideoId; }

  global.youtubePlayer = Object.freeze({ loadSdk, mount, pause, destroy, currentVideoId });
})(window);
