// DIAGNÓSTICO (não corrige, só identifica a causa) — músicas duplicadas no
// PC. Investiga se o mesmo conteúdo pode adquirir clientId diferente
// durante push/pull/merge/migração/troca de owner/normalização, usando
// js/song-model.js + js/song-repository.js + js/library-sync.js reais.
//
// Roda isolado com:
//   node tests/production-duplicate-diagnosis.test.js

const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const songModelSource = fs.readFileSync("js/song-model.js", "utf8");
const songRepositorySource = fs.readFileSync("js/song-repository.js", "utf8");
const librarySyncSource = fs.readFileSync("js/library-sync.js", "utf8");

const results = [];
function record(name, fn) {
  try { fn(); results.push({ name, status: "PASS" }); }
  catch (error) { results.push({ name, status: "FAIL", reason: error.message }); }
}

function makeContext(seedStorage = {}) {
  const memory = new Map(Object.entries(seedStorage).map(([k, v]) => [k, structuredClone(v)]));
  const storage = {
    get: (k, f) => (memory.has(k) ? structuredClone(memory.get(k)) : f),
    set: (k, v) => { memory.set(k, structuredClone(v)); return true; }
  };
  const context = { window: null, console, structuredClone, storage };
  context.window = context;
  vm.runInNewContext(songModelSource, context);
  vm.runInNewContext(songRepositorySource, context);
  vm.runInNewContext(librarySyncSource, context);
  return { context, memory };
}

function song(i, extra = {}) {
  return { id: `local-${i}`, title: `Música ${i}`, artist: "Artista", key: "C", capo: "", blocos: [{ l: "Refrão", c: "C  G" }], ...extra };
}

// ------------------------------------------------------------------
// CAUSA 1 (confirmada): migração da biblioteca local (activateOwner com
// migrationCandidate) casa registros só por clientId/id — nunca por
// título+artista. Uma música que já existe no cache da conta na nuvem E
// também existe localmente antes do primeiro login, mas com um `id` local
// diferente e sem clientId, não é reconhecida como "a mesma" — as duas
// sobrevivem, e a local acaba ganhando seu PRÓPRIO clientId ao sincronizar,
// virando uma segunda linha em personal_songs com o MESMO conteúdo.
// ------------------------------------------------------------------
record("Migração de biblioteca local não deduplica por conteúdo — mesma música com id diferente sobrevive duas vezes", () => {
  const cloudSong = song(1, { id: "cloud-1", librarySync: { clientId: "clientid-from-cloud", serverVersion: 3, contentHash: "abc", syncedAt: new Date().toISOString(), conflict: null } });
  // A mesma música, mas criada localmente ANTES do primeiro login (sem
  // clientId, id diferente) — mesmo título/artista/blocos.
  const localDuplicate = song(1, { id: "pc-local-1" });

  const { context } = makeContext({
    sc_songs_v1: [localDuplicate],
    cifras_musicas_v1: [localDuplicate],
    sc_personal_song_caches_v1: { "user-dup": [cloudSong] }
  });
  const repository = context.window.songRepository;
  const boot = repository.load([]);
  const activation = repository.activateOwner("user-dup", boot, []);

  const ids = activation.songs.map((item) => item.id);
  assert.equal(ids.length, 2, `activateOwner deveria manter as 2 entradas (não deduplicadas por conteúdo) — manteve ${ids.length}: ${ids.join(",")}`);
  assert.ok(activation.songs.some((item) => item.id === "cloud-1"), "a versão já sincronizada da nuvem deveria continuar presente");
  assert.ok(activation.songs.some((item) => item.id === "pc-local-1"), "a versão local pré-existente também continua presente — é essa que vira duplicata ao sincronizar");

  // Confirma que as duas têm o MESMO conteúdo musical (mesmo título/
  // artista/tom/blocos) — não é um caso de "duas músicas diferentes por
  // coincidência", é o MESMO conteúdo com identidades locais diferentes
  // (sameContent()/contentHash() não servem aqui porque incluem `id` no
  // hash, e é justamente o `id` que difere entre as duas origens).
  const cloudEntry = activation.songs.find((item) => item.id === "cloud-1");
  const localEntry = activation.songs.find((item) => item.id === "pc-local-1");
  assert.equal(localEntry.title, cloudEntry.title, "títulos deveriam ser idênticos");
  assert.equal(localEntry.artist, cloudEntry.artist, "artistas deveriam ser idênticos");
  assert.deepEqual(localEntry.blocos, cloudEntry.blocos, "blocos/cifra deveriam ser idênticos");
});

// ------------------------------------------------------------------
// CAUSA descartada: o merge de pull() (não-migração) NÃO gera duplicatas —
// ele só cria uma entrada local nova quando o clientId remoto não é
// encontrado localmente por NENHUM registro (índice<0), e cada clientId do
// servidor é único (constraint owner_user_id+client_id no backend). Duas
// chamadas de pull() seguidas com os mesmos dados não duplicam nada.
// ------------------------------------------------------------------
record("pull()/merge() normal (fora de migração) não duplica: clientId do servidor é a chave de identidade", () => {
  const { context } = makeContext();
  // merge() é uma função pura exposta direto em librarySync — não precisa
  // de initialize()/appAuth para este teste.
  const remoteRecord = { clientId: "clientid-x", songData: song(2), version: 1, updatedAt: new Date().toISOString(), deletedAt: null };
  const first = context.librarySync.merge([], [remoteRecord]);
  const second = context.librarySync.merge(first.songs, [remoteRecord]);
  assert.equal(second.songs.length, 1, "aplicar o mesmo registro remoto duas vezes não deveria duplicar localmente");
});

const passed = results.filter((r) => r.status === "PASS").length;
const failed = results.filter((r) => r.status === "FAIL");
console.log("\n=== DIAGNÓSTICO — músicas duplicadas no PC ===");
results.forEach((r) => console.log(`[${r.status}] ${r.name}${r.status === "FAIL" ? "\n        -> " + r.reason : ""}`));
console.log(`\n${passed}/${results.length} passaram, ${failed.length} falharam.`);
process.exitCode = 0; // dossiê de diagnóstico: nenhuma correção esperada aqui.
