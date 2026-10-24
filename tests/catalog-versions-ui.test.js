// Decisão de 24/10/2026: várias versões da mesma música (título + artista + tom).
const assert = require("node:assert/strict");
const fs = require("node:fs");
global.window = global;
require("../js/song-model.js");
const m = global.songModel;
const lib = [m.create({ id: "1", title: "Gratidão", artist: "Felipe Rodrigues", key: "G" })];
assert.ok(m.findDuplicate(lib, m.create({ title: "Gratidão", artist: "Felipe Rodrigues", key: "G" })), "mesmo título, artista e tom: mesma música");
assert.equal(m.findDuplicate(lib, m.create({ title: "Gratidão", artist: "Felipe Rodrigues", key: "A" })), null, "outro tom: outra versão");
assert.equal(m.findDuplicate(lib, m.create({ title: "Gratidão", artist: "Outro", key: "G" })), null, "outro artista: outra versão");
assert.ok(m.findDuplicate(lib, m.create({ title: "Gratidão", artist: "Felipe Rodrigues" })), "sem tom: não separa");
assert.ok(m.findDuplicate([m.create({ title: "X", artist: "Y", key: "Db" })], m.create({ title: "X", artist: "Y", key: "C#" })), "Db = C#");
const html = fs.readFileSync("index.html", "utf8");
assert.match(html, /function renderPlaylistCatalogVersions\(panel,versions\)/);
assert.match(html, /harmonicSummaryClient\.catalogVersion\(item\.id\)/);
const client = fs.readFileSync("js/ai/harmonic-summary-client.js", "utf8");
assert.match(client, /catalogRequest\("versions\?"/);
console.log("catalog-versions-ui.test.js: OK");
