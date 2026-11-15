// Playlist recebida: música que já existe na biblioteca de quem recebe é completada com a
// Letra + Cifras enviada (no tom/forma de quem recebe) e o tom da playlist é mantido.
const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const root = (value) => String(value || "").match(/^[A-G]#?/)?.[0] || "";
const shiftText = (text, n) => String(text).replace(/\b([A-G]#?)/g, (m) => NOTES[(NOTES.indexOf(m) + n + 120) % 12]);
let committed = null, created = null;
const context = {
  console, setTimeout, clearTimeout,
  musicas: [{ id: 7, title: "Sublime", artist: "FHOP", key: "C", capo: "", blocos: [{ l: "", c: "C G" }] }],
  songFormat: { parseCapo: (v) => Number(String(v || "").match(/\d+/)?.[0] || 0) },
  shiftText,
  eventKeyShift: (a, b) => (NOTES.indexOf(root(b)) - NOTES.indexOf(root(a)) + 12) % 12,
  transposeEventChordText: (text, n) => String(text).split("\n").map((l, i) => i % 2 === 0 ? shiftText(l, n) : l).join("\n"),
  commitSongs: (songs) => { committed = songs; return true; },
  userPlaylists: { create: (owner, name, items) => (created = { id: "p1", name, items }) },
  closeEventAdminSheet() {}, showToast() {}, songModel: { create: (s) => s },
  document: { addEventListener() {}, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] },
  location: { search: "", hash: "", href: "https://x/" }, history: { replaceState() {} },
  localStorage: { getItem: () => null, setItem() {} }, storage: { get: (k, f) => f, set: () => true }
};
context.window = context;
vm.runInNewContext(fs.readFileSync("js/home-playlists.js", "utf8"), context);
const hp = context.homePlaylists;
const received = {
  id: "s1", name: "Avalanche", items: [{
    song: { title: "Sublime", artist: "FHOP", key: "D", capo: "", fullChordSheet: { content: "D A\nQuem é como Tu, Jesus", sections: [] } },
    playback: { semitones: 2 }, notes: ""
  }]
};
hp.__setReceivedForTest ? hp.__setReceivedForTest(received) : null;
assert.ok(hp.saveReceivedFrom, "saveReceivedFrom exportado para teste");
hp.saveReceivedFrom(received);
const song = committed.find((s) => s.id === 7);
assert.ok(song.fullChordSheet, "a música existente ganhou a Letra + Cifras enviada");
assert.equal(song.fullChordSheet.content, "C G\nQuem é como Tu, Jesus", "Letra + Cifras vem no tom da cópia de quem recebe");
assert.equal(committed.length, 1, "não duplica a música");
assert.equal(created.items[0].songId, 7);
assert.equal(created.items[0].playback.semitones, 4, "tom combinado (D + 2 = E) a partir do C de quem recebe");
console.log("received-playlist-completes-songs.test.js: OK");
