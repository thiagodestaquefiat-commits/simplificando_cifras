const assert = require("node:assert/strict");

global.window = {};
require("../js/song-model.js");

const model = window.songModel;
const now = "2026-08-14T12:00:00.000Z";

const legacy = model.create({
  id: 1,
  title: "  A Casa É Sua  ",
  artist: "Casa Worship",
  key: "G",
  capo: "Capotraste casa 2",
  blocos: [{ l: "Verso", c: "G  C" }]
}, { now });

assert.equal(legacy.id, 1);
assert.equal(legacy.title, "A Casa É Sua");
assert.equal(legacy.artist, "Casa Worship");
assert.equal(legacy.album, null);
assert.equal(legacy.duration, null);
assert.equal(legacy.spotifyTrackId, null);
assert.deepEqual(legacy.blocos, [{ l: "Verso", c: "G  C" }]);
assert.equal(legacy.createdAt, now);
assert.equal(legacy.updatedAt, now);

const spacing = model.create({ title: "Espaçamento", blocos: [{ l: " Verso ", c: "  G   C  \n" }] }, { now });
assert.deepEqual(spacing.blocos, [{ l: " Verso ", c: "  G   C  \n" }], "a migração deve preservar o texto musical");

const spotifySong = model.create({
  id: 2,
  title: "Oceans",
  artist: "Hillsong United",
  duration: 503123.4,
  spotifyTrackId: "track-123",
  spotifyUri: "spotify:track:track-123",
  isrc: "auabc1234567"
}, { now });

assert.equal(spotifySong.duration, 503123);
assert.equal(spotifySong.isrc, "AUABC1234567");
assert.equal(model.findDuplicate([spotifySong], { spotifyTrackId: "track-123" }).id, 2);
assert.equal(model.findDuplicate([spotifySong], { spotifyTrackId: "TRACK-123" }), null);
assert.equal(model.findDuplicate([spotifySong], { isrc: "auabc1234567" }).id, 2);
assert.equal(model.findDuplicate([legacy], { title: "a casa e sua", artist: "casa worship" }).id, 1);
assert.equal(model.findDuplicate([legacy], { title: "A Casa É Sua", artist: "Outro artista" }), null);

const untitledArtist = model.create({ id: 3, title: "Graça", blocos: [] }, { now });
assert.equal(model.findDuplicate([untitledArtist], { title: "graca", artist: "" }).id, 3);
assert.throws(() => model.create({ title: "   " }), /título/);

const enriched = model.enrich(legacy, {
  spotifyTrackId: "spotify-1",
  coverUrl: "https://example.test/cover.jpg",
  duration: 200000
}, { now: "2026-08-15T12:00:00.000Z" });
assert.equal(enriched.id, legacy.id);
assert.equal(enriched.createdAt, legacy.createdAt);
assert.equal(enriched.spotifyTrackId, "spotify-1");
assert.equal(enriched.duration, 200000);
assert.equal(enriched.updatedAt, "2026-08-15T12:00:00.000Z");

console.log("song-model.test.js: OK");
