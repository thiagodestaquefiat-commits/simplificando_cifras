const assert = require("node:assert/strict");

global.window = {};
require("../js/song-model.js");
require("../js/spotify-song-linker.js");

const linker = window.spotifySongLinker;
const tracks = [
  { title: "A Casa É Sua", artist: "Casa Worship", spotifyTrackId: "one", spotifyUri: "spotify:track:one", album: "Casa", duration: 300000, coverUrl: "cover", isrc: "BR123" },
  { title: "A Casa É Sua (Ao Vivo)", artist: "Casa Worship", spotifyTrackId: "live" },
  { title: "Oceans", artist: "Hillsong UNITED, TAYA", spotifyTrackId: "oceans" }
];

assert.equal(linker.findAutomaticMatch({ title: "a casa e sua", artist: "Casa Worship" }, tracks).spotifyTrackId, "one");
assert.equal(linker.findAutomaticMatch({ title: "Oceans", artist: "TAYA" }, tracks).spotifyTrackId, "oceans");
assert.equal(linker.findAutomaticMatch({ title: "A Casa É Sua", artist: "Outro" }, tracks), null);
assert.equal(linker.findAutomaticMatch({ title: "A Casa É Sua" }, tracks).spotifyTrackId, "one");
assert.equal(linker.findAutomaticMatch({ title: "Duplicada" }, [{ title: "Duplicada" }, { title: "Duplicada" }]), null);

const changes = linker.changesForTrack({ title: "Oceans", artist: "" }, tracks[2]);
assert.equal(changes.artist, "Hillsong UNITED, TAYA");
assert.equal(changes.spotifyTrackId, "oceans");
assert.equal(linker.searchQuery({ title: "Oceans", artist: "Hillsong UNITED" }), "Oceans Hillsong UNITED");

console.log("spotify-song-linker.test.js: OK");
