// A biblioteca guardava em cada música uma cópia inteira dela (librarySync.baseSongData) só para saber
// se mudou desde a última sincronização. No armazenamento agora fica a impressão digital dessa cópia,
// e a detecção de "música alterada" continua igual.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const memory = new Map();
const context = {
  console, structuredClone, setTimeout, clearTimeout, navigator: { onLine: false },
  storage: { get: (k, f) => (memory.has(k) ? structuredClone(memory.get(k)) : f), set: (k, v) => { memory.set(k, structuredClone(v)); return true; } },
  addEventListener() {}
};
context.window = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync("js/song-model.js", "utf8"), context);
vm.runInContext(fs.readFileSync("js/library-sync.js", "utf8"), context);
const sync = context.librarySync;

const base = { id: "1", title: "Bom Perfume", artist: "Artista", key: "F", blocos: [{ l: "", c: "D A G" }],
  fullChordSheet: { content: "D A G\nLetra" } };
const synced = { ...base, librarySync: { clientId: "c1", serverVersion: 1, contentHash: sync.contentHash(base), baseSongData: sync.wireSong(base) } };
const remote = [{ id: "s1", clientId: "c1", songData: sync.wireSong(base), version: 1, updatedAt: "2026-10-28T00:00:00Z", deletedAt: null }];

const stored = sync.compactForStorage(synced);
assert.equal("baseSongData" in stored.librarySync, false, "cópia inteira não vai para o armazenamento");
assert.ok(stored.librarySync.basePayloadHash, "fica a impressão digital");
assert.equal(stored.librarySync.clientId, "c1");
assert.ok(JSON.stringify(stored).length < JSON.stringify(synced).length);
assert.ok(synced.librarySync.baseSongData, "a música em memória não é alterada");

assert.equal(sync.inspect([synced], remote).localPending, 0);
assert.equal(sync.inspect([stored], remote).localPending, 0, "sem mudança: continua sincronizada");
const edited = { ...stored, fullChordSheet: { content: "D A G\nLetra corrigida" } };
assert.equal(sync.inspect([edited], remote).localPending, 1, "mudou depois de guardada: vai para a nuvem");
console.log("library-sync-compact.test.js: OK");
