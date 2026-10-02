const assert = require("node:assert/strict");

global.window = {
  storage: {
    snapshotRaw: () => ({
      cifras_musicas_v1: JSON.stringify([{ id: 1 }, { id: 99 }]),
      cifras_setlists_v1: JSON.stringify([{ id: 7, musicas: [99] }]),
      sc_favorites_v2: JSON.stringify(["99"]),
      chave_desconhecida: "valor-bruto-preservado",
      "sb-project-auth-token": "secret-session",
      sc_personal_song_caches_v1: JSON.stringify({ "other-account": [{ title: "Private B" }] })
    })
  }
};

global.document = {
  body: { appendChild() {} },
  createElement: () => ({ click() {}, remove() {} })
};

global.URL = {
  createObjectURL: () => "blob:teste",
  revokeObjectURL() {}
};

require("../js/export-library.js");

const context = {
  ownerId: "owner-a", authenticated: true,
  catalogoPadrao: [{ id: 1 }],
  musicas: [{ id: 1 }, { id: 99 }],
  events: [{ id: 7, title: "Culto", musicas: [99], repertoire: [{ personalEdits: { "owner-a": { notes: "Minha nota" }, "owner-b": { notes: "Segredo B" } } }] }],
  playlists: [{ id: 7, musicas: [99] }],
  medleys: [{ musicId: 99 }],
  favoritos: ["99"],
  configuracoes: { tema: "escuro" }
};

const payload = window.libraryExporter.buildExport(context);
const result = window.libraryExporter.export(context);

assert.equal(payload.formato, "simplificando-cifras-exportacao");
assert.equal(payload.versao, 2);
assert.deepEqual(Object.keys(payload.origens), [
  "sessaoAtual"
]);
assert.equal(payload.origens.armazenamentoUsuario, undefined);
assert.equal(payload.escopo.ownerId, "owner-a");
assert.doesNotMatch(JSON.stringify(payload), /secret-session|Private B|Segredo B|chave_desconhecida/);
assert.deepEqual(payload.origens.sessaoAtual.playlists, payload.origens.sessaoAtual.eventos);
assert.deepEqual(payload.origens.sessaoAtual.eventos[0].repertoire[0].personalEdits, { "owner-a": { notes: "Minha nota" } });
assert.deepEqual(payload.origens.sessaoAtual.medleys, context.medleys);
assert.deepEqual(payload.origens.sessaoAtual.favoritos, context.favoritos);
assert.deepEqual(payload.origens.sessaoAtual.configuracoes, context.configuracoes);
assert.equal(result.standardCount, 0);
assert.equal(result.storedCount, 2);

console.log("export-library.test.js: OK");
