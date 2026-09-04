const assert = require("node:assert/strict");

const actions = [];
let fakePlayer = null;

class FakePlayer {
  constructor(options) {
    this.options = options;
    this.listeners = {};
    this.paused = false;
    fakePlayer = this;
    actions.push("create:" + options.name);
  }
  addListener(name, listener) { this.listeners[name] = listener; }
  connect() {
    actions.push("connect");
    queueMicrotask(() => this.listeners.ready({ device_id: "browser-device" }));
    return Promise.resolve(true);
  }
  activateElement() { actions.push("activate"); return Promise.resolve(); }
  pause() {
    actions.push("pause");
    this.paused = true;
    this.listeners.player_state_changed({
      paused: true,
      position: 1000,
      duration: 180000,
      repeat_mode: 0,
      track_window: { current_track: { uri: "spotify:track:one" } }
    });
    return Promise.resolve();
  }
  resume() {
    actions.push("resume");
    this.paused = false;
    this.listeners.player_state_changed({
      paused: false,
      position: 1000,
      duration: 180000,
      repeat_mode: 0,
      track_window: { current_track: { uri: "spotify:track:one" } }
    });
    return Promise.resolve();
  }
  seek(position) {
    actions.push("sdk-seek:" + position);
    this.listeners.player_state_changed({
      paused: this.paused,
      position,
      duration: 180000,
      repeat_mode: 0,
      track_window: { current_track: { uri: "spotify:track:one" } }
    });
    return Promise.resolve();
  }
}

const fakeDocument = {
  querySelector() { return null; },
  createElement() { return { setAttribute() {}, addEventListener() {} }; },
  head: { appendChild() {} }
};

global.window = {
  document: fakeDocument,
  Spotify: { Player: FakePlayer },
  spotifyAuth: {
    isAuthenticated() { return true; },
    async getAccessToken() { return "access-token"; }
  },
  spotifyApi: {
    async startPlayback(deviceId, uri, position) {
      actions.push("start:" + deviceId + ":" + uri + ":" + (position === undefined ? "initial" : position));
      fakePlayer.listeners.player_state_changed({
        paused: false,
        position: Number(position) || 0,
        duration: 180000,
        repeat_mode: 0,
        track_window: { current_track: { uri } }
      });
    },
    async seekPlayback(deviceId, position) { actions.push("seek:" + deviceId + ":" + position); },
    async setRepeatMode(deviceId, enabled) { actions.push("repeat:" + deviceId + ":" + enabled); }
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
  assert.equal(actions.filter((action) => action.startsWith("start:")).length, 1);
  assert.equal(actions.filter((action) => action.startsWith("create:")).length, 1);
  assert.ok(actions.includes("start:browser-device:spotify:track:one:initial"));

  await window.spotifyPlayer.seek(15000);
  assert.ok(actions.includes("sdk-seek:15000"));
  assert.equal(actions.filter((action) => action.startsWith("start:")).length, 1, "seek não deve reiniciar a faixa pela Web API");
  await window.spotifyPlayer.toggle(song);
  assert.equal(actions.filter((action) => action === "pause").length, 1);
  await window.spotifyPlayer.seek(30000);
  await window.spotifyPlayer.toggle(song);
  await window.spotifyPlayer.setRepeat(true);
  assert.ok(actions.includes("sdk-seek:30000"));
  assert.equal(actions.filter((action) => action.startsWith("seek:")).length, 0, "o SDK local deve controlar a posição");
  assert.equal(actions.filter((action) => action === "resume").length, 1);
  assert.ok(actions.includes("repeat:browser-device:true"));
  assert.equal(fakePlayer.options.enableMediaSession, true);
  console.log("spotify-player.test.js: OK");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
