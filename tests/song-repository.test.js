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

console.log("song-repository.test.js: OK");
