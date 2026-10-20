// Playlists pessoais: cada item guarda o próprio tom, sem mexer na música da biblioteca.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const memory = new Map();
const context = { console };
context.window = context;
context.storage = { get: (k, f) => memory.has(k) ? JSON.parse(memory.get(k)) : f, set: (k, v) => { memory.set(k, JSON.stringify(v)); return true; } };
vm.runInNewContext(fs.readFileSync("js/user-playlists.js", "utf8"), context);
const P = context.userPlaylists;

const a = P.create("owner-a", "Ministro A");
assert.ok(a && a.id, "cria playlist");
assert.equal(P.create("owner-a", "   "), null, "nome vazio é recusado");
P.addSong("owner-a", a.id, "song-1", { semitones: 2, capo: 1, video: { x: 1 } });
P.addSong("owner-a", a.id, "song-2");
let current = P.get("owner-a", a.id);
assert.equal(JSON.stringify(current.items.map(item => item.songId)), JSON.stringify(["song-1", "song-2"]));
assert.equal(JSON.stringify(current.items[0].playback), JSON.stringify({ semitones: 2, capo: 1 }), "só guarda campos de execução");
P.moveItem("owner-a", a.id, current.items[1].id, -1);
current = P.get("owner-a", a.id);
assert.equal(JSON.stringify(current.items.map(item => item.songId)), JSON.stringify(["song-2", "song-1"]), "reordena");
P.setItemPlayback("owner-a", a.id, current.items[1].id, { semitones: -1 });
assert.equal(P.get("owner-a", a.id).items[1].playback.semitones, -1);
assert.equal(P.get("owner-a", a.id).items[1].playback.capo, 1, "atualização parcial mantém o capo");
P.setItemNotes("owner-a", a.id, current.items[1].id, "  só voz  ");
assert.equal(P.get("owner-a", a.id).items[1].notes, "só voz");
P.rename("owner-a", a.id, "Ministra B");
assert.equal(P.get("owner-a", a.id).name, "Ministra B");
const copy = P.duplicate("owner-a", a.id);
assert.equal(copy.items.length, 2);
assert.notEqual(copy.items[0].id, P.get("owner-a", a.id).items[0].id, "cópia tem itens próprios");
assert.equal(P.list("owner-b").length, 0, "contas separadas");
assert.equal(P.remove("owner-a", copy.id), true);
assert.equal(P.list("owner-a").length, 1);

const html = fs.readFileSync("index.html", "utf8");
assert.match(html, /id="home-playlists"/);
assert.match(html, /data-home-view="home"/);
assert.match(html, /homePlaylists\.libraryVisible\(\)/, "Home não monta a lista inteira da biblioteca");
assert.match(html, /detailPlaylistContext&&window\.homePlaylists/, "tom alterado na música salva só na playlist");
assert.match(html, /data-event-song-filter="playlists"/, "eventos puxam playlists");
assert.ok(html.indexOf('js/home-playlists.js') < html.indexOf('function renderMusicas'), "módulo carrega antes da Home");
console.log("user-playlists.test.js: OK (CRUD, tom por item, contas separadas e ligações na Home/eventos)");
