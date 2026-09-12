const assert = require("node:assert/strict");

const values = new Map();
const legacySongs = [{ id: 7, title: "Legada", key: "D", capo: "", blocos: [{ l: "", c: "D  G" }] }];
values.set("cifras_musicas_v1", legacySongs);

global.window = {
  storage: {
    get(key, fallback) {
      return values.has(key) ? structuredClone(values.get(key)) : fallback;
    },
    set(key, value) {
      values.set(key, structuredClone(value));
      return true;
    }
  }
};

require("../js/song-model.js");
require("../js/song-repository.js");

const repository = window.songRepository;
const migrated = repository.load([{ id: 1, title: "Padrão", blocos: [] }]);

assert.equal(migrated.length, 1);
assert.equal(migrated[0].id, 7);
assert.equal(migrated[0].title, "Legada");
assert.ok(migrated[0].createdAt);
assert.deepEqual(values.get("sc_songs_v1"), migrated);
assert.deepEqual(values.get("cifras_musicas_v1"), legacySongs, "a migração inicial não deve destruir a chave legada");

const added = repository.addOrReuse(migrated, {
  id: 8,
  title: "Nova Música",
  artist: "Equipe",
  spotifyTrackId: "track-8",
  blocos: []
}, { now: "2026-08-14T12:00:00.000Z" });
assert.equal(added.created, true);
assert.equal(added.songs.length, 2);

const duplicate = repository.addOrReuse(added.songs, {
  id: 9,
  title: "Outro título retornado",
  artist: "Outro artista",
  spotifyTrackId: "track-8",
  coverUrl: "https://example.test/cover.jpg",
  blocos: []
}, { now: "2026-08-15T12:00:00.000Z" });
assert.equal(duplicate.created, false);
assert.equal(duplicate.songs.length, 2);
assert.equal(duplicate.song.id, 8);
assert.equal(duplicate.song.coverUrl, "https://example.test/cover.jpg");

const updated = repository.update(duplicate.songs, 8, { key: "A", capo: "Capotraste casa 2" }, { now: "2026-08-16T12:00:00.000Z" });
assert.equal(updated.song.key, "A");
assert.equal(updated.song.createdAt, "2026-08-14T12:00:00.000Z");
assert.equal(updated.song.updatedAt, "2026-08-16T12:00:00.000Z");

assert.equal(repository.save(updated.songs), true);
assert.deepEqual(values.get("sc_songs_v1"), values.get("cifras_musicas_v1"), "o salvamento deve manter rollback compatível");
assert.equal(repository.remove(updated.songs, "8").length, 1);

const legacySnapshot = structuredClone(values.get("sc_songs_v1"));
const defaults = structuredClone(legacySnapshot);
const ownerA = repository.activateOwner("owner-a", legacySnapshot, defaults);
assert.equal(ownerA.migrationCandidate, true, "biblioteca persistida recebe oferta mesmo quando coincide com o catálogo embutido");
assert.deepEqual(ownerA.songs, legacySnapshot);
assert.deepEqual(values.get("sc_songs_v1"), legacySnapshot, "a oferta não move nem apaga a biblioteca legada");

const ownerB = repository.activateOwner("owner-b", legacySnapshot, defaults);
assert.deepEqual({ songs: ownerB.songs, migrationCandidate: ownerB.migrationCandidate }, { songs: [], migrationCandidate: false }, "outra conta não herda nem recebe oferta da biblioteca reservada para A");
repository.save([{ id: "b-1", title: "Somente B", blocos: [] }]);

const ownerAAgain = repository.activateOwner("owner-a", [{ id: "b-1", title: "Somente B", blocos: [] }], defaults);
assert.equal(ownerAAgain.migrationCandidate, true);
assert.deepEqual(ownerAAgain.songs, legacySnapshot, "A continua com a cópia íntegra até o backend confirmar");
repository.confirmActiveOwner(ownerAAgain.songs);

const ownerBAgain = repository.activateOwner("owner-b", ownerAAgain.songs, defaults);
assert.deepEqual(ownerBAgain.songs.map(song => song.title), ["Somente B"], "caches locais ficam separados por owner autenticado");
const ownerAFinal = repository.activateOwner("owner-a", ownerBAgain.songs, defaults);
assert.equal(ownerAFinal.migrationCandidate, false);
assert.deepEqual(ownerAFinal.songs, legacySnapshot, "após confirmação, A reabre seu cache contextualizado");
assert.deepEqual(values.get("sc_songs_v1"), legacySnapshot, "a confirmação não limpa as chaves legadas protegidas");

const fs = require("node:fs");
const vm = require("node:vm");
const freshValues = new Map();
const freshContext = { console, structuredClone };
freshContext.window = { storage: { get: (key, fallback) => freshValues.has(key) ? structuredClone(freshValues.get(key)) : fallback, set: (key, value) => { freshValues.set(key, structuredClone(value)); return true; } } };
vm.runInNewContext(fs.readFileSync("js/song-model.js", "utf8"), freshContext);
vm.runInNewContext(fs.readFileSync("js/song-repository.js", "utf8"), freshContext);
const freshDefaults = [{ id: "seed-1", title: "Catálogo inicial", blocos: [] }];
const freshBoot = freshContext.window.songRepository.load(freshDefaults);
const freshOwner = freshContext.window.songRepository.activateOwner("new-owner", freshBoot, freshDefaults);
assert.equal(freshOwner.migrationCandidate, true, "durante a transição, o catálogo inicial também integra a biblioteca atual do usuário");
assert.deepEqual(Array.from(freshOwner.songs).map(song => song.id), ["seed-1"]);
assert.equal(freshValues.get("sc_seed_library_only_v1"), true, "o marcador de origem do seed continua preservado");

const reloadValues = new Map();
function repositoryContext(store) {
  const context = { console, structuredClone };
  context.window = { storage: { get: (key, fallback) => store.has(key) ? structuredClone(store.get(key)) : fallback, set: (key, value) => { store.set(key, structuredClone(value)); return true; } } };
  vm.runInNewContext(fs.readFileSync("js/song-model.js", "utf8"), context);
  vm.runInNewContext(fs.readFileSync("js/song-repository.js", "utf8"), context);
  return context.window.songRepository;
}
repositoryContext(reloadValues).load(freshDefaults);
const afterReloadRepository = repositoryContext(reloadValues);
const afterReloadSongs = afterReloadRepository.load(freshDefaults);
const afterReloadOwner = afterReloadRepository.activateOwner("new-after-reload", afterReloadSongs, freshDefaults);
assert.equal(afterReloadOwner.migrationCandidate, true, "o marcador seed não bloqueia a migração depois do reload");
assert.deepEqual(Array.from(afterReloadOwner.songs).map(song => song.id), ["seed-1"]);

function seedTransitionScenario(total, cachedCount = 0) {
  const store = new Map();
  const songs = Array.from({ length: total }, (_, index) => ({
    id: `transition-${total}-${index}`,
    title: `Música ${index + 1}`,
    blocos: [],
    librarySync: { clientId: `transition-client-${total}-${index}`, version: 1 }
  }));
  store.set("sc_songs_v1", songs);
  store.set("cifras_musicas_v1", songs);
  store.set("sc_seed_library_only_v1", true);
  store.set("sc_personal_song_caches_v1", { "seed-owner": songs.slice(0, cachedCount) });
  store.set("sc_legacy_library_owner_v1", "seed-owner");
  const scopedRepository = repositoryContext(store);
  const bootSongs = scopedRepository.load([]);
  const activation = scopedRepository.activateOwner("seed-owner", bootSongs, []);
  return { store, songs, activation };
}

for (const total of [86, 91, 106]) {
  const scenario = seedTransitionScenario(total);
  assert.equal(scenario.activation.migrationCandidate, true, `${total} músicas marcadas como seed continuam elegíveis`);
  assert.equal(scenario.activation.songs.length, total);
  assert.deepEqual(
    scenario.activation.songs.map(song => song.librarySync.clientId),
    scenario.songs.map(song => song.librarySync.clientId),
    `${total} clientIds existentes permanecem inalterados`
  );
  assert.equal(scenario.store.get("sc_seed_library_only_v1"), true, "a ativação apenas lê o marcador seed");
}

const partiallySynced = seedTransitionScenario(106, 40);
assert.equal(partiallySynced.activation.migrationCandidate, true, "cache parcial não oculta as músicas restantes");
assert.equal(partiallySynced.activation.songs.length, 106);
assert.deepEqual(partiallySynced.activation.songs.map(song => song.id), partiallySynced.songs.map(song => song.id));

const transitionValues = new Map();
const transitionClientIds = ["legacy-client-1", "legacy-client-2", "legacy-client-3"];
const transitionSongs = transitionClientIds.map((clientId, index) => ({
  id: `legacy-${index + 1}`,
  title: `Legada ${index + 1}`,
  blocos: [{ l: "", c: "C  G" }],
  librarySync: { clientId, version: 1 }
}));
transitionValues.set("sc_songs_v1", transitionSongs);
transitionValues.set("cifras_musicas_v1", transitionSongs);
transitionValues.set("sc_personal_song_caches_v1", { "transition-owner": [] });
transitionValues.set("sc_legacy_library_owner_v1", "transition-owner");
const transitionRepository = repositoryContext(transitionValues);
const transitionBoot = transitionRepository.load([]);
const emptyCacheOwner = transitionRepository.activateOwner("transition-owner", transitionBoot, []);
assert.equal(emptyCacheOwner.migrationCandidate, true, "cache contextual vazia não pode ocultar biblioteca legada da mesma conta");
assert.equal(emptyCacheOwner.songs.length, 3);
assert.deepEqual(
  emptyCacheOwner.songs.map((song) => song.librarySync.clientId),
  transitionClientIds,
  "clientIds existentes são preservados durante a recuperação da biblioteca legada"
);
assert.deepEqual(transitionValues.get("sc_songs_v1"), transitionSongs, "ativar a conta não altera sc_songs_v1");
assert.deepEqual(transitionValues.get("cifras_musicas_v1"), transitionSongs, "ativar a conta não altera cifras_musicas_v1");

const incompleteValues = new Map();
incompleteValues.set("sc_songs_v1", transitionSongs);
incompleteValues.set("cifras_musicas_v1", transitionSongs);
incompleteValues.set("sc_personal_song_caches_v1", {
  "transition-owner": [{ ...transitionSongs[0], title: "Legada 1 editada na conta" }]
});
incompleteValues.set("sc_legacy_library_owner_v1", "transition-owner");
const incompleteRepository = repositoryContext(incompleteValues);
const incompleteBoot = incompleteRepository.load([]);
const incompleteOwner = incompleteRepository.activateOwner("transition-owner", incompleteBoot, []);
assert.equal(incompleteOwner.migrationCandidate, true, "cache incompleta mantém músicas locais faltantes como candidatas à cópia");
assert.equal(incompleteOwner.songs.length, 3);
assert.equal(incompleteOwner.songs[0].title, "Legada 1 editada na conta", "registro contextual conhecido prevalece pela mesma identidade");
assert.deepEqual(incompleteOwner.songs.map((song) => song.id), ["legacy-1", "legacy-2", "legacy-3"], "a ordem legada permanece estável");

const foreignOwner = incompleteRepository.activateOwner("other-owner", incompleteOwner.songs, []);
assert.deepEqual(Array.from(foreignOwner.songs), [], "outra conta não absorve a biblioteca legada reservada");

console.log("song-repository.test.js: OK (seed 86/91/106, cache parcial, migração legada e isolamento A/B)");
