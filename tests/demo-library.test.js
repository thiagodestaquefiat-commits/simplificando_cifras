const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

global.window = {};
require("../js/demo-library.js");
const demoLibrary = window.demoLibrary;
const demos = demoLibrary.catalog();
assert.equal(demos.length, 4, "a biblioteca inicial deve ter exatamente quatro demos");
assert.equal(new Set(demos.map((song) => song.id)).size, 4, "IDs das demos devem ser estáveis e únicos");
demos.forEach((song) => {
  assert.ok(song.fullChordSheet?.content.includes("\n"), `${song.title} precisa de letra e cifra completas`);
  assert.ok(song.blocos.length >= 2 && song.blocos.every((block) => block.l && block.c), `${song.title} precisa de resumo harmônico`);
  assert.match(song.summary, /Resumo harmônico:/);
});

const html = fs.readFileSync(require("node:path").resolve(__dirname, "..", "index.html"), "utf8");
const start = html.indexOf("const musicasLegadasParaMigracao=") + "const musicasLegadasParaMigracao=".length;
const end = html.indexOf("\n];", start) + 2;
const legacySongs = vm.runInNewContext(html.slice(start, end));
assert.equal(legacySongs.length, 86);
assert.equal(legacySongs.filter(demoLibrary.isLegacyCatalogSong).length, 86, "somente assinaturas exatas podem ser removidas");

const personalized = { ...legacySongs[0], artist: "Versão pessoal", fullChordSheet: { content: "C\nMinha letra" } };
const migrated = demoLibrary.migrate([...legacySongs, personalized]);
assert.equal(migrated.removed, 86);
assert.deepEqual(migrated.songs, [personalized], "versões pessoais ou enriquecidas devem ser preservadas");
assert.deepEqual(demoLibrary.migrate(migrated.songs).songs, [personalized], "a migração deve ser idempotente");

const pristine = demoLibrary.migrate(legacySongs);
assert.equal(pristine.seeded, true);
assert.equal(pristine.songs.length, 4);

const memory = new Map();
const storage = { get: (key, fallback) => memory.has(key) ? structuredClone(memory.get(key)) : fallback, set: (key, value) => { memory.set(key, structuredClone(value)); return true; } };
const medley = demoLibrary.loadMedley(storage, true);
assert.equal(medley.length, 2, "deve existir um medley de demonstração");
assert.deepEqual(demoLibrary.loadMedley(storage, true), medley, "o medley não deve ser duplicado ao reabrir ou fazer login");
console.log("demo-library.test.js: OK");
