const assert = require("node:assert/strict");

global.window = { location: { href: "https://roudy.test/" } };
require("../js/song-artwork.js");

const artwork = window.songArtwork;
assert.equal(artwork.resolve({}), "assets/icons/roudy-icon-v4-192.png");
assert.equal(artwork.resolveReal({ coverUrl: "assets/search/musicas.svg" }), null);
assert.equal(artwork.resolveReal({ artworkUrl: "assets/search/musicas.svg?v=2" }), null);
assert.equal(artwork.resolveReal({ artworkUrl: artwork.DEFAULT_ARTWORK }), null);
assert.equal(artwork.resolveReal({ coverUrl: "https://legacy.test/cover.jpg" }), "https://legacy.test/cover.jpg");
assert.equal(artwork.resolveReal({ artworkUrl: "https://spotify.test/cover.jpg", youtubeThumbnailUrl: "https://i.ytimg.com/vi/abc/hqdefault.jpg" }), "https://spotify.test/cover.jpg");
assert.equal(artwork.resolveReal({ coverUrl: "https://i.ytimg.com/vi/old/hqdefault.jpg", youtubeThumbnailUrl: "https://i.ytimg.com/vi/new/hqdefault.jpg" }), "https://i.ytimg.com/vi/new/hqdefault.jpg");
assert.equal(artwork.resolveReal({ artworkUrl: "https://i.ytimg.com/vi/old/hqdefault.jpg", artworkSource: "youtube", coverUrl: "https://spotify.test/official.jpg", youtubeThumbnailUrl: "https://i.ytimg.com/vi/new/hqdefault.jpg" }), "https://spotify.test/official.jpg");
assert.equal(artwork.resolveYoutubeThumbnail({ artworkUrl: "https://spotify.test/cover.jpg", youtubeVideoId: "abc" }), "https://i.ytimg.com/vi/abc/hqdefault.jpg");
assert.equal(artwork.cleanUrl("javascript:alert(1)"), null);
assert.deepEqual(artwork.collectDistinct([
  { artworkUrl: "https://image.test/a.jpg" },
  { coverUrl: "https://image.test/a.jpg" },
  {},
  { youtubeThumbnailUrl: "https://i.ytimg.com/vi/b/hqdefault.jpg" },
  { artworkUrl: "https://image.test/c.jpg" },
  { artworkUrl: "https://image.test/d.jpg" },
  { artworkUrl: "https://image.test/e.jpg" }
]), ["https://image.test/a.jpg", "https://i.ytimg.com/vi/b/hqdefault.jpg", "https://image.test/c.jpg", "https://image.test/d.jpg"]);
assert.deepEqual(artwork.collectDistinct([]), []);
assert.deepEqual(artwork.collectDistinct([{ coverUrl: "assets/search/musicas.svg" }, { artworkUrl: artwork.DEFAULT_ARTWORK }]), []);
assert.equal(artwork.collectDistinct([{ artworkUrl: "a.jpg" }]).length, 1);
assert.equal(artwork.collectDistinct([{ artworkUrl: "a.jpg" }, { artworkUrl: "b.jpg" }]).length, 2);
assert.equal(artwork.collectDistinct([{ artworkUrl: "a.jpg" }, {}, { artworkUrl: "b.jpg" }, { artworkUrl: "c.jpg" }]).length, 3);
assert.deepEqual(artwork.collectDistinct([{ artworkUrl: "a.jpg" }, { artworkUrl: "b.jpg" }, { artworkUrl: "c.jpg" }, { artworkUrl: "d.jpg" }, { artworkUrl: "e.jpg" }]), ["a.jpg", "b.jpg", "c.jpg", "d.jpg"]);

console.log("song-artwork.test.js: OK");
