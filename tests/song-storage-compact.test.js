// A Letra + Cifras não é mais guardada duas vezes (song.fullChordSheet e editorData.fullChordSheet):
// com as músicas completas, a biblioteca passava do limite do navegador e o salvar falhava.
const assert = require("node:assert/strict");

const values = new Map();
global.window = {
  storage: {
    get(key, fallback) { return values.has(key) ? structuredClone(values.get(key)) : fallback; },
    set(key, value) { values.set(key, structuredClone(value)); return true; },
    remove(key) { values.delete(key); return true; }
  }
};
require("../js/song-model.js");
require("../js/song-repository.js");

const sheet = { visibility: "private", source: "user_upload", content: "Am\nQue seja hoje", sections: [{ nome: "Refrão", linhas: [{ letra: "Que seja hoje", acordes: [{ acorde: "Am", posicao: 0 }] }] }] };
const song = { id: 1, title: "Que Seja Hoje", key: "Am", blocos: [], fullChordSheet: sheet,
  editorData: { id: 1, title: "Que Seja Hoje", sections: [], fullChordSheet: sheet } };
const orphan = { id: 2, title: "Só no editor", key: "C", blocos: [], editorData: { id: 2, sections: [], fullChordSheet: sheet } };

const repository = window.songRepository;
repository.load([]);
assert.ok(repository.save([song, orphan]));
const stored = values.get("sc_songs_v1");
const first = stored.find((item) => String(item.id) === "1");
const second = stored.find((item) => String(item.id) === "2");
assert.deepEqual(first.fullChordSheet, sheet, "a Letra + Cifras continua salva");
assert.equal("fullChordSheet" in first.editorData, false, "sem a cópia repetida dentro do editorData");
assert.deepEqual(second.editorData.fullChordSheet, sheet, "se só existe a cópia do editor, ela fica");
console.log("song-storage-compact.test.js: OK");
