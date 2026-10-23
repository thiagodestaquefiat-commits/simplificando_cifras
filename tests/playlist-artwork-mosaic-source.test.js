const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const script = fs.readFileSync(path.join(root, "js", "home-playlists.js"), "utf8");
const css = fs.readFileSync(path.join(root, "css", "home-playlists.css"), "utf8");

assert.match(script, /songArtwork\?\.collectDistinct\(songs, 4\)/);
assert.match(script, /if \(coverImage\) return/);
assert.match(script, /home-playlist-mosaic--\$\{urls\.length\}/);
assert.match(script, /function applyPlaylistBackdrop/);
assert.match(script, /applyPlaylistBackdrop\(target, playlist\.coverImage/);
assert.match(css, /--playlist-cover-size,cover/);
assert.match(css, /--playlist-cover-position,center top/);
assert.match(script, /loading="lazy" decoding="async"/);
const artworkBody = script.slice(script.indexOf("function artwork"), script.indexOf("// ── Visões"));
assert.doesNotMatch(artworkBody, /canvas|toDataURL\(/i);
for (const count of [1, 2, 3, 4]) assert.match(css, new RegExp(`home-playlist-mosaic--${count}`));
assert.match(css, /home-playlist-mosaic--3 img:first-child\{grid-row:1\/3\}/);

console.log("playlist-artwork-mosaic-source.test.js: OK");
