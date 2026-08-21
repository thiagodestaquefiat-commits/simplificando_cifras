const assert = require("node:assert/strict");

const actions = [];
let fakeController = null;

class FakeController {
  constructor() { this.listeners = {}; }
  addListener(name, listener) { this.listeners[name] = listener; }
  loadEntity(uri) { actions.push("load:" + uri); }
  play() {
    actions.push("play");
    this.listeners.playback_started({ data: { playingURI: "spotify:track:one" } });
    this.listeners.playback_update({ data: { playingURI: "spotify:track:one", isPaused: false, isBuffering: false, position: 1000, duration: 180000 } });
  }
  pause() {
    actions.push("pause");
    this.listeners.playback_update({ data: { playingURI: "spotify:track:one", isPaused: true, isBuffering: false, position: 1000, duration: 180000 } });
  }
  togglePlay() {
    actions.push("togglePlay");
    if (actions.filter((action) => action === "togglePlay").length % 2 === 1) this.play();
    else this.pause();
  }
  seek(seconds) { actions.push("seek:" + seconds); }
  restart() { actions.push("restart"); }
}

const fakeDocument = {
  querySelector() { return null; },
  getElementById() { return null; },
  createElement() { return { setAttribute() {}, addEventListener() {}, appendChild() {} }; },
  head: { appendChild() {} },
  body: { appendChild() {} }
};

global.window = {
  document: fakeDocument,
  SpotifyIframeApi: {
    createController(element, options, callback) {
      actions.push("create:" + options.uri);
      fakeController = new FakeController();
      callback(fakeController);
      queueMicrotask(() => fakeController.listeners.ready());
    }
  }
};

require("../js/spotify-player.js");

(async () => {
  const song = { spotifyUri: "spotify:track:one", duration: 180000 };
  await window.spotifyPlayer.prepare(song);
  const first = window.spotifyPlayer.toggle(song);
  const duplicate = window.spotifyPlayer.toggle(song);
  assert.equal(first, duplicate, "cliques concorrentes devem compartilhar uma única operação");
  await first;
  assert.equal(actions.filter((action) => action === "togglePlay").length, 1);
  assert.equal(actions.filter((action) => action === "play").length, 1);
  assert.equal(actions.filter((action) => action.startsWith("create:")).length, 1);

  await window.spotifyPlayer.toggle(song);
  assert.equal(actions.filter((action) => action === "togglePlay").length, 2);
  assert.equal(actions.filter((action) => action === "pause").length, 1);
  await window.spotifyPlayer.seek(30000);
  await window.spotifyPlayer.setRepeat(true);
  assert.ok(actions.includes("seek:30"));
  console.log("spotify-player.test.js: OK");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
