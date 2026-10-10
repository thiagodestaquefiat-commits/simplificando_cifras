// Garante que exclusões vindas da nuvem não releiam/regravem a biblioteca
// inteira uma vez por música (causa de ~13 s de travamento no Galaxy A14).
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function repositoryContext(store, counters) {
  const context = { console, structuredClone };
  context.window = {
    storage: {
      get: (key, fallback) => { counters.get += 1; return store.has(key) ? structuredClone(store.get(key)) : fallback; },
      set: (key, value) => { counters.set += 1; store.set(key, structuredClone(value)); return true; },
      remove: (key) => { store.delete(key); return true; }
    }
  };
  vm.runInNewContext(fs.readFileSync("js/song-model.js", "utf8"), context);
  vm.runInNewContext(fs.readFileSync("js/song-repository.js", "utf8"), context);
  return context.window.songRepository;
}

const store = new Map();
const counters = { get: 0, set: 0 };
const repository = repositoryContext(store, counters);
const songs = Array.from({ length: 30 }, (_, index) => ({
  id: `song-${index}`,
  title: `Música ${index}`,
  blocos: [{ l: "", c: "C G" }],
  librarySync: { clientId: `client-${index}`, serverVersion: 1 }
}));
repository.load([]);
repository.activateOwner("owner-1", [], []);
assert.equal(repository.save(songs), true);
const owner = { songs: store.get("sc_personal_song_caches_v1")["owner-1"] };
assert.equal(owner.songs.length, 30);

const deletedIds = Array.from({ length: 20 }, (_, index) => `client-${index}`);

// Primeira aplicação: registra tudo com uma única gravação das exclusões.
counters.set = 0;
assert.equal(repository.markDeletedMany(deletedIds, true), true);
assert.ok(counters.set <= 2, `lote grava uma vez as exclusões e uma vez o cache (gravou ${counters.set})`);
assert.deepEqual(Array.from(repository.getDeletedClientIds()).sort(), [...deletedIds].sort());
assert.deepEqual(Array.from(repository.getPendingDeletedClientIds()), [], "exclusões vindas da nuvem ficam confirmadas");
const cached = store.get("sc_personal_song_caches_v1")["owner-1"];
assert.equal(cached.length, 10, "cache da conta já sem as músicas excluídas");

// Reaplicar as mesmas exclusões (o que acontece a cada abertura do app) não grava nada.
counters.set = 0;
assert.equal(repository.markDeletedMany(deletedIds, true), true);
for (const id of deletedIds) assert.equal(repository.markDeleted(id, true), true);
assert.equal(counters.set, 0, "exclusões já confirmadas não regravam o armazenamento");

// Comportamento antigo preservado: exclusão local pendente e depois confirmada.
counters.set = 0;
assert.equal(repository.markDeleted(owner.songs[25]), true);
assert.ok(Array.from(repository.getPendingDeletedClientIds()).includes("client-25"));
assert.equal(repository.confirmDeleted("client-25"), true);
assert.ok(!Array.from(repository.getPendingDeletedClientIds()).includes("client-25"));
assert.equal(repository.markDeleted(""), false, "id vazio continua inválido");
assert.equal(repository.markDeletedMany(["", "client-26"], true), false, "lote informa id inválido");
assert.ok(Array.from(repository.getDeletedClientIds()).includes("client-26"), "ids válidos do lote são registrados");

console.log("library-sync-deletions-perf.test.js: OK (exclusões em lote e sem regravação repetida)");
