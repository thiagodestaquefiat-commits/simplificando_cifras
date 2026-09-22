const assert = require("node:assert/strict");
const crypto = require("node:crypto");
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
const fullChordSheetHashes = new Map([
  ["demo-ah-jesus-coracao-igual-ao-teu", "cd3186f84e6502d477333c40f89b6e4ad01470adea14dd66a11d33a52566b26d"],
  ["demo-cultura-do-ceu", "087c044b913689ea100475c6867d9c3b5180a477d7419fce94817d2fbbcfa608"],
  ["demo-digno-e-o-senhor", "9a0c15e6bb9276b69ba4d62b6319cbf78c61cf55125f4a5a1480e4c98487d4f8"],
  ["demo-santo-pra-sempre", "24b86b6f43621eb37ec952fc0b25714e84f55f3256513e093f0fc15bc39280b5"]
]);
const instrumentalSection = /^(?:Intro|Interlúdio|Solo|Final)(?:\s+\d+)?$/i;
const normalizeText = (value) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/gi, " ").trim().toLowerCase();
assert.equal(demos.length, 4, "a biblioteca inicial deve ter exatamente quatro demos");
assert.equal(new Set(demos.map((song) => song.id)).size, 4, "IDs das demos devem ser estáveis e únicos");
assert.deepEqual(demos.map((song) => [song.title, song.artist, song.key]), expected);
demos.forEach((song) => {
  assert.ok(song.fullChordSheet?.content.includes("\n"), `${song.title} precisa de letra e cifra completas`);
  assert.equal(crypto.createHash("sha256").update(song.fullChordSheet.content).digest("hex"), fullChordSheetHashes.get(song.id), `${song.title} não pode alterar a cifra completa validada`);
  assert.ok(song.blocos.length >= 2 && song.blocos.every((block) => block.l && block.c), `${song.title} precisa de resumo harmônico`);
  assert.match(song.summary, /Resumo harmônico:/);
  const parsed = window.songFormat.fromLegacy(song);
  assert.ok(parsed.sections.some((section) => section.lines.some((line) => line.chords.length)), song.title + " precisa ser aceita pelo parser");
  song.blocos.forEach((block) => {
    const lines = block.c.split("\n").map((line) => line.trim()).filter(Boolean);
    const hook = lines[0].replace(/\.\.\.$/, "");
    if (hook !== block.l) {
      assert.ok(normalizeText(song.fullChordSheet.content).includes(normalizeText(hook)), `${song.title} / ${block.l} precisa usar uma frase da cifra completa`);
      assert.ok(hook.split(/\s+/).length <= 8, `${song.title} / ${block.l} precisa manter a frase-gancho curta`);
    } else {
      assert.match(block.l, instrumentalSection, `${song.title} / ${block.l} só pode omitir frase em parte instrumental`);
      assert.equal(hook, block.l, `${song.title} / ${block.l} deve manter apenas o nome da parte instrumental`);
    }
    assert.ok(lines.length >= 2, `${song.title} / ${block.l} deve mostrar identificação antes dos acordes`);
  });
  const summaryChords = song.blocos.flatMap((block) => block.c.split("\n").slice(1).flatMap((line) => line.split(/\s+/).filter(Boolean)));
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
