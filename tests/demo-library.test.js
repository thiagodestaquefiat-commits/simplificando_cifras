const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

global.window = {};
require("../js/instruments/instrument-definitions.js");
require("../js/instruments/multi-instrument-chord-library.js");
require("../js/editor/song-format.js");
require("../js/editor/song-editor-state.js");
require("../js/demo-library.js");
const demoLibrary = window.demoLibrary;
const demos = demoLibrary.catalog();
const expected = [
  ["Ah, Jesus / Coração Igual ao Teu", "Julliany Souza", "G"],
  ["Cultura do Céu", "Davi Fernandes", "C"],
  ["Digno É o Senhor", "Felipe Rodrigues", "E"],
  ["Santo Pra Sempre", "Ana Nóbrega", "E"]
];
assert.equal(demos.length, 4, "a biblioteca inicial deve ter exatamente quatro demos");
assert.equal(new Set(demos.map((song) => song.id)).size, 4, "IDs das demos devem ser estáveis e únicos");
assert.deepEqual(demos.map((song) => [song.title, song.artist, song.key]), expected);
demos.forEach((song) => {
  assert.ok(song.fullChordSheet?.content.includes("\n"), `${song.title} precisa de letra e cifra completas`);
  assert.ok(song.blocos.length >= 2 && song.blocos.every((block) => block.l && block.c), `${song.title} precisa de resumo harmônico`);
  assert.match(song.summary, /Resumo harmônico:/);
  const parsed = window.songFormat.fromLegacy(song);
  assert.ok(parsed.sections.some((section) => section.lines.some((line) => line.chords.length)), song.title + " precisa ser aceita pelo parser");
  const summaryChords = song.blocos.flatMap((block) => block.c.split(/\s+/).filter(Boolean));
  assert.ok(summaryChords.every((chord) => window.multiInstrumentChordLibrary.parseChord(chord)), song.title + " possui acorde inválido em blocos");
  assert.ok(summaryChords.every((chord) => window.songEditorState.transposeChord(chord, 1) !== chord), song.title + " precisa permitir transposição");
  const chordLines = song.fullChordSheet.content.split("\n").filter((line) => line.trim() && line.trim().split(/\s+/).every((token) => window.multiInstrumentChordLibrary.parseChord(token)));
  assert.ok(chordLines.length >= song.blocos.length, song.title + " precisa manter acordes transponíveis na cifra completa");
});

const html = fs.readFileSync(require("node:path").resolve(__dirname, "..", "index.html"), "utf8");
const start = html.indexOf("const musicasLegadasParaMigracao=") + "const musicasLegadasParaMigracao=".length;
const end = html.indexOf("\n];", start) + 2;
const legacySongs = vm.runInNewContext(html.slice(start, end));
assert.equal(legacySongs.length, 86);
assert.equal(legacySongs.filter(demoLibrary.isLegacyCatalogSong).length, 86, "as assinaturas legadas continuam reconhecíveis sem autorizar remoção");

const personalized = { ...legacySongs[0], artist: "Versão pessoal", fullChordSheet: { content: "C\nMinha letra" } };
const migrated = demoLibrary.migrate([...legacySongs, personalized]);
assert.equal(migrated.removed, 0);
assert.equal(migrated.songs.length, 87, "as 86 originais e versões pessoais devem ser preservadas");
assert.deepEqual(demoLibrary.migrate(migrated.songs).songs, migrated.songs, "a preservação deve ser idempotente");

const pristine = demoLibrary.migrate(legacySongs);
assert.equal(pristine.seeded, false);
assert.equal(pristine.songs.length, 86, "a biblioteca existente nunca é substituída por demos");

const memory = new Map();
const storage = { get: (key, fallback) => memory.has(key) ? structuredClone(memory.get(key)) : fallback, set: (key, value) => { memory.set(key, structuredClone(value)); return true; } };
const medley = demoLibrary.loadMedley(storage, true);
assert.equal(new Set(medley.map((block) => block.musicId)).size, 1, "deve existir exatamente um medley de demonstração");
assert.equal(medley[0].musicId, "demo-medley-nada-alem-alvo");
assert.deepEqual([...new Set(medley.map((block) => block.musicTitle))], ["Nada Além do Sangue", "Alvo Mais Que a Neve"]);
assert.ok(medley.length >= 5 && medley.every((block) => block.key === "A" && block.capo === 1 && block.chords), "o medley precisa preservar forma de A e capotraste na 1ª casa");
assert.deepEqual(demoLibrary.loadMedley(storage, true), medley, "o medley não deve ser duplicado ao reabrir ou fazer login");
console.log("demo-library.test.js: OK");
