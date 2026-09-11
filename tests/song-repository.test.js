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
assert.equal(freshOwner.migrationCandidate, false, "catálogo criado no boot atual não é tratado como biblioteca legada");
assert.deepEqual(Array.from(freshOwner.songs), [], "usuário realmente novo começa com biblioteca pessoal vazia");

console.log("song-repository.test.js: OK (migração legada e isolamento A/B)");
