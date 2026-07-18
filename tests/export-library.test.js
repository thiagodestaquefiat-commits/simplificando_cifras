const assert = require("node:assert/strict");

global.window = {
  storage: {
    snapshotRaw: () => ({
      cifras_musicas_v1: JSON.stringify([{ id: 1 }, { id: 99 }]),
      cifras_setlists_v1: JSON.stringify([{ id: 7, musicas: [99] }]),
      sc_favorites_v2: JSON.stringify(["99"]),
      chave_desconhecida: "valor-bruto-preservado"
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
  catalogoPadrao: [{ id: 1 }],
  musicas: [{ id: 1 }, { id: 99 }],
  playlists: [{ id: 7, musicas: [99] }],
  medleys: [{ musicId: 99 }],
  favoritos: ["99"],
  configuracoes: { tema: "escuro" }
};

const payload = window.libraryExporter.buildExport(context);
const result = window.libraryExporter.export(context);

assert.equal(payload.formato, "simplificando-cifras-exportacao");
assert.equal(payload.versao, 1);
assert.deepEqual(Object.keys(payload.origens), [
  "catalogoPadrao",
  "armazenamentoUsuario",
  "sessaoAtual"
]);
assert.deepEqual(payload.origens.catalogoPadrao.musicas, [{ id: 1 }]);
assert.equal(
  payload.origens.armazenamentoUsuario.armazenamentoBruto.chave_desconhecida,
  "valor-bruto-preservado"
);
assert.equal(
  payload.origens.armazenamentoUsuario.dadosConhecidos.musicas.cifras_musicas_v1.length,
  2
);
assert.deepEqual(payload.origens.sessaoAtual.playlists, context.playlists);
assert.deepEqual(payload.origens.sessaoAtual.medleys, context.medleys);
assert.deepEqual(payload.origens.sessaoAtual.favoritos, context.favoritos);
assert.deepEqual(payload.origens.sessaoAtual.configuracoes, context.configuracoes);
assert.equal(result.standardCount, 1);
assert.equal(result.storedCount, 2);

console.log("export-library.test.js: OK");
