const assert = require("node:assert/strict");

global.window = {};
require("../js/song-model.js");
require("../js/youtube-song-linker.js");

const videos = [
  { title: "A Casa É Sua | Casa Worship (Clipe Oficial)", artist: "Casa Worship", youtubeChannelTitle: "Casa Worship", youtubeVideoId: "one", youtubeUrl: "https://youtu.be/one", coverUrl: "cover" },
  { title: "A Casa É Sua - cover", artist: "Outro canal", youtubeChannelTitle: "Outro canal", youtubeVideoId: "two" }
];

assert.equal(window.youtubeSongLinker.findAutomaticMatch({ title: "A Casa É Sua", artist: "Casa Worship" }, videos).youtubeVideoId, "one");
assert.equal(window.youtubeSongLinker.findAutomaticMatch({ title: "A Casa É Sua", artist: "Artista diferente" }, videos), null);
assert.equal(window.youtubeSongLinker.searchQuery({ title: "Oceans", artist: "Hillsong" }), "Oceans Hillsong");
assert.deepEqual(window.youtubeSongLinker.changesForVideo({ artist: "Artista local" }, videos[0]), {
  artist: "Artista local",
  coverUrl: "cover",
  youtubeVideoId: "one",
  youtubeUrl: "https://youtu.be/one",
  youtubeChannelTitle: "Casa Worship"
});
console.log("youtube-song-linker.test.js: OK");
