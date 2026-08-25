const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const context = { console, Date, Math, JSON, Object, Array, String, Number, Boolean, RegExp, Error };
context.window = context;
context.location = { hostname: "localhost" };
vm.createContext(context);
[
  "js/instruments/instrument-definitions.js",
  "js/instruments/multi-instrument-chord-library.js",
  "js/editor/song-format.js",
  "js/ai/api-config.js",
  "js/ai/harmonic-summary-client.js"
].forEach((file) => vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file }));

assert.equal(context.apiConfig.API_BASE_URL, "http://127.0.0.1:5000");
assert.equal(context.apiConfig.harmonicSummaryEndpoint(), "http://127.0.0.1:5000/api/resumo-harmonico");
context.SIMPLIFICANDO_CIFRAS_CONFIG = { API_BASE_URL: "https://backend.example/" };
assert.equal(context.apiConfig.harmonicSummaryEndpoint(), "https://backend.example/api/resumo-harmonico");
assert.deepEqual(JSON.parse(JSON.stringify(context.harmonicSummaryClient.validatePayload("pesquisa", { titulo: " Rugido do Leão ", artista: "" }))), { tipo: "pesquisa", titulo: "Rugido do Leão" });
assert.deepEqual(JSON.parse(JSON.stringify(context.harmonicSummaryClient.validatePayload("texto", { conteudo: "Dm Bb C" }))), { tipo: "texto", conteudo: "Dm Bb C" });
const upload = { name: "cifra.png", size: 1024 };
const uploadPayload = context.harmonicSummaryClient.validatePayload("arquivo", { arquivo: upload, titulo: " Música " });
assert.equal(uploadPayload.tipo, "arquivo");
assert.equal(uploadPayload.arquivo, upload);
assert.equal(uploadPayload.titulo, "Música");
assert.throws(() => context.harmonicSummaryClient.validatePayload("pesquisa", {}), (error) => error.kind === "invalid_input");
assert.throws(() => context.harmonicSummaryClient.validatePayload("texto", {}), (error) => error.kind === "invalid_input");
assert.throws(() => context.harmonicSummaryClient.validatePayload("arquivo", {}), (error) => error.kind === "invalid_input");

const response = {
  schemaVersion: 1,
  titulo: "<img>Rugido do Leão</img>",
  artista: "Artista teste",
  tom: "Dm",
  confianca: "media",
  observacoes: ["Revisar antes de salvar"],
  trechos: [
    { acordes: ["D", "C", "D"], repeticoes: 7, fraseGuia: "<b>Ouçam as trombetas</b>", secao: "Introdução" },
    { acordes: ["Dm", "Bb", "C", "G"], repeticoes: null, fraseGuia: "Ouçam o grito da vitória", secao: null }
  ]
};
response.fullChordSheet = { visibility: "private", source: "user_upload", content: "INTRO\nDm Bb C G\nLetra completa fornecida" };
const model = context.harmonicSummaryClient.responseToEditorModel(response, "guitar");
assert.equal(model.fullChordSheet.visibility, "private");
assert.equal(model.fullChordSheet.content, response.fullChordSheet.content);
assert.equal(model.source, "ai");
assert.equal(model.status, "draft");
assert.equal(model.aiGenerated, true);
assert.equal(model.reviewedByUser, false);
assert.equal(model.aiConfidence, "media");
assert.equal(model.sections[0].lines[0].repeticoes, 7);
assert.equal(model.sections[0].lines[0].lyrics, "bOuçam as trombetas/b");
assert.deepEqual(JSON.parse(JSON.stringify(model.sections[0].lines[0].chords.map((item) => item.chord))), ["D", "C", "D"]);
assert.doesNotMatch(model.title + model.sections[0].lines[0].lyrics, /[<>]/);
assert.throws(() => context.harmonicSummaryClient.assertResponse({ ...response, trechos: [{ acordes: ["H7"], fraseGuia: "x" }] }), (error) => error.kind === "invalid_data");

(async () => {
  const oversizedJson = {
    ok: false,
    status: 413,
    json: async () => ({ erro: { codigo: "requisicao_muito_grande" } })
  };
  await assert.rejects(
    context.harmonicSummaryClient.generate("pesquisa", { titulo: "Teste" }, { fetch: async () => oversizedJson }),
    (error) => error.kind === "file_too_large" && /10 MB/.test(error.message)
  );

  const oversizedHtml = {
    ok: false,
    status: 413,
    json: async () => { throw new SyntaxError("HTML response"); }
  };
  await assert.rejects(
    context.harmonicSummaryClient.generate("pesquisa", { titulo: "Teste" }, { fetch: async () => oversizedHtml }),
    (error) => error.kind === "file_too_large" && /10 MB/.test(error.message)
  );

  console.log("ai-harmonic-summary.test.js: OK (configuração, payload, 413, conversão, repetições, frases e segurança)");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
