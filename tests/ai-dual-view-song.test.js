const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const window = { console, Date, Math, JSON, Object, Array, String, Number, Boolean, RegExp, Error };
window.window = window;
vm.createContext(window);
[
  "js/instruments/instrument-definitions.js",
  "js/instruments/multi-instrument-chord-library.js",
  "js/editor/song-format.js",
  "js/song-model.js",
  "js/ai/harmonic-summary-client.js"
].forEach((file) => vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), window, { filename: file }));

const raw = {
  schemaVersion: 2,
  titulo: "Uma música",
  artista: "Equipe",
  tom: "G",
  capotraste: 2,
  confianca: "alta",
  observacoes: [],
  harmonicSummary: { blocos: [{ secao: "Refrão", acordes: ["G", "Bm", "C"], repeticoes: 2, fraseGuia: "Só um nome há" }] },
  fullChordSheet: {
    visibility: "private",
    source: "user_upload",
    content: "REFRÃO\nG Bm C\nSó um nome há",
    sections: [{ nome: "Refrão", linhas: [{ letra: "Só um nome há", acordes: [{ acorde: "G", posicao: 0 }, { acorde: "Bm", posicao: 3 }, { acorde: "C", posicao: 8 }] }] }]
  }
};

const draft = window.harmonicSummaryClient.responseToEditorModel(raw, "guitar", { type: "upload", name: "fonte.pdf", url: null });
draft.accessContext = { scope: "team", ownerId: "leader-1", teamId: "team-1" };
const song = window.songModel.create(window.songFormat.toLegacy(draft));
const summary = window.songFormat.harmonicSummary(song);

assert.equal(song.title, "Uma música");
assert.equal(song.fullChordSheet.sections[0].linhas[0].acordes[1].posicao, 3);
assert.deepEqual(JSON.parse(JSON.stringify(summary.sections[0].lines[0].chords.map((item) => item.chord))), ["G", "Bm", "C"]);
assert.equal(summary.sections[0].lines[0].repeticoes, 2);
assert.equal(summary.sections[0].lines[0].lyrics, "Só um nome há");
assert.deepEqual(JSON.parse(JSON.stringify(song.accessContext)), { scope: "team", ownerId: "leader-1", teamId: "team-1" });
assert.deepEqual(JSON.parse(JSON.stringify(song.sourceInfo)), { type: "upload", name: "fonte.pdf", url: null });

const legacy = window.songModel.create({ id: 86, title: "Antiga", artist: "Catálogo", key: "C", blocos: [{ l: "", c: "C G\nFrase antiga" }] });
assert.equal(window.songFormat.harmonicSummary(legacy).sections[0].lines[0].chords.length, 2);
assert.equal(legacy.fullChordSheet, null);

console.log("ai-dual-view-song.test.js: OK (um Song, duas visualizações, posições, legado e team)");
