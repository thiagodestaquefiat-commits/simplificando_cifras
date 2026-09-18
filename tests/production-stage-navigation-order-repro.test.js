// BUG 2 (achado adicional, CORRIGIDO) — navigationContext (usado pelo Modo
// Palco e por "abrir próxima/anterior música" no repertório) congelava a
// ORDEM das músicas no momento em que openDetailFromPlaylist() era chamado.
// Se um pull em segundo plano atualizasse event.repertoire (por exemplo,
// outro dispositivo reordenou e este dispositivo sincronizou) enquanto o
// usuário já estava navegando aquele evento, a navegação continuava na
// ordem antiga.
//
// Corrigido com refreshStageNavigationOrder() em index.html, chamada no
// início de renderSetlists() (que já roda depois de todo pull/reconcile de
// Eventos) — este teste extrai a função REAL de index.html (não reimplementa
// a lógica) e a exercita junto com js/navigation-context.js real.
//
// Roda isolado com:
//   node tests/production-stage-navigation-order-repro.test.js

const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

global.window = global;
require("../js/navigation-context.js");

const results = [];
function record(name, fn) {
  try { fn(); results.push({ name, status: "PASS" }); }
  catch (error) { results.push({ name, status: "FAIL", reason: error.message }); }
}

// Extrai refreshStageNavigationOrder() do index.html real, sem reimplementar
// a lógica — se a função mudar de nome ou sumir, este teste quebra alto e
// cedo em vez de continuar validando uma cópia desatualizada.
const html = fs.readFileSync("index.html", "utf8");
const start = html.indexOf("function refreshStageNavigationOrder(){");
assert.ok(start >= 0, "refreshStageNavigationOrder() não foi encontrada em index.html — a correção foi removida/renomeada?");
let depth = 0, end = start;
for (let i = html.indexOf("{", start); i < html.length; i++) {
  if (html[i] === "{") depth++;
  else if (html[i] === "}") { depth--; if (depth === 0) { end = i + 1; break; } }
}
const refreshStageNavigationOrderSource = html.slice(start, end);

function makeSandbox(event, musicas) {
  const sandbox = {
    window: null,
    navigationContext: window.navigationContext,
    findEvent: (id) => (String(event.id) === String(id) ? event : null),
    musicas
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(refreshStageNavigationOrderSource, sandbox);
  return sandbox;
}

// Reproduz exatamente a lógica de stageContextData() em index.html: usa a
// ordem em navigationContext, busca o item atual (fresco) em event.repertoire.
function stageContextData(event) {
  const context = window.navigationContext.get();
  if (!context) return { songs: [] };
  const songs = context.songIds.map((songId) => event.repertoire.find((item) => String(item.songId) === String(songId))).filter(Boolean);
  return { context, songs };
}

record("refreshStageNavigationOrder() atualiza a navegação quando o pull reordena o evento aberto, sem fechar a tela", () => {
  const musicas = ["a", "b", "c", "d"].map((id) => ({ id }));
  const event = { id: "event-1", repertoire: [{ songId: "a" }, { songId: "b" }, { songId: "c" }, { songId: "d" }] };

  // Usuário abre o evento pela ordem original A,B,C,D (openDetailFromPlaylist).
  window.navigationContext.setPlaylist(event.id, event.repertoire.map((item) => item.songId), 0);
  assert.deepEqual(stageContextData(event).songs.map((item) => item.songId), ["a", "b", "c", "d"], "pré-condição: ordem inicial deveria ser A,B,C,D");

  // Pull em segundo plano reordena para D,A,C,B — o usuário está na música
  // "a" (índice 0 na ordem antiga).
  event.repertoire = [{ songId: "d" }, { songId: "a" }, { songId: "c" }, { songId: "b" }];

  // Isso é o que renderSetlists() faz agora, automaticamente, depois de
  // qualquer pull/reconcile — sem o usuário fechar e reabrir a tela.
  makeSandbox(event, musicas).refreshStageNavigationOrder();

  const after = stageContextData(event);
  assert.deepEqual(after.songs.map((item) => item.songId), ["d", "a", "c", "b"], "a navegação deveria refletir a ordem nova sem reabrir a tela");
  assert.equal(after.context.currentIndex, 1, "a música que o usuário estava vendo (\"a\") deveria continuar selecionada, só que agora no índice correto da ordem nova");
  assert.equal(after.context.songIds[after.context.currentIndex], "a", "o índice atualizado precisa apontar para a MESMA música que o usuário estava navegando, não para outra");
});

record("refreshStageNavigationOrder() preserva overrides pessoais (não mexe em conteúdo, só na ordem)", () => {
  const musicas = ["a", "b"].map((id) => ({ id }));
  const event = {
    id: "event-2",
    repertoire: [
      { songId: "a", shared: { title: "Oficial A" }, personal: { title: "Pessoal A" } },
      { songId: "b", shared: { title: "Oficial B" }, personal: null }
    ]
  };
  window.navigationContext.setPlaylist(event.id, ["a", "b"], 0);
  event.repertoire = [
    { songId: "b", shared: { title: "Oficial B" }, personal: null },
    { songId: "a", shared: { title: "Oficial A" }, personal: { title: "Pessoal A" } }
  ];
  makeSandbox(event, musicas).refreshStageNavigationOrder();
  const after = stageContextData(event);
  assert.deepEqual(after.songs.map((item) => item.songId), ["b", "a"], "ordem deveria ter sido atualizada");
  const itemA = after.songs.find((item) => item.songId === "a");
  assert.deepEqual(itemA.personal, { title: "Pessoal A" }, "override pessoal da música A não pode ser alterado pela atualização de ordem");
});

record("refreshStageNavigationOrder() não faz nada quando a ordem não mudou (sem navigationContext.setPlaylist supérfluo)", () => {
  const musicas = ["a", "b"].map((id) => ({ id }));
  const event = { id: "event-3", repertoire: [{ songId: "a" }, { songId: "b" }] };
  window.navigationContext.setPlaylist(event.id, ["a", "b"], 1);
  const before = window.navigationContext.get();
  makeSandbox(event, musicas).refreshStageNavigationOrder();
  const after = window.navigationContext.get();
  assert.deepEqual(after, before, "sem mudança de ordem, o contexto de navegação não deveria ser recriado");
});

record("reabrir a tela do evento (openDetailFromPlaylist) continua funcionando como antes", () => {
  const event = { repertoire: [{ songId: "d" }, { songId: "a" }, { songId: "c" }, { songId: "b" }] };
  window.navigationContext.setPlaylist("event-1", event.repertoire.map((item) => item.songId), 0);
  const after = stageContextData(event).songs.map((item) => item.songId);
  assert.deepEqual(after, ["d", "a", "c", "b"], "reabrir a tela deveria continuar mostrando a ordem correta");
});

const passed = results.filter((r) => r.status === "PASS").length;
const failed = results.filter((r) => r.status === "FAIL");
console.log("\n=== BUG 2 (achado adicional) — navigationContext CORRIGIDO ===");
results.forEach((r) => console.log(`[${r.status}] ${r.name}${r.status === "FAIL" ? "\n        -> " + r.reason : ""}`));
console.log(`\n${passed}/${results.length} passaram, ${failed.length} falharam.`);
process.exitCode = failed.length > 0 ? 1 : 0;
