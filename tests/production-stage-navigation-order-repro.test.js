// BUG 2 (achado adicional) — navigationContext (usado pelo Modo Palco e por
// "abrir próxima/anterior música" no repertório) congela a ORDEM das
// músicas no momento em que openDetailFromPlaylist() é chamado. Se um pull
// em segundo plano atualizar event.repertoire (por exemplo, outro
// dispositivo reordenou e este dispositivo sincronizou) enquanto o usuário
// já está navegando aquele evento, a navegação continua na ordem antiga —
// nada re-chama navigationContext.setPlaylist() automaticamente depois de
// um pull. Usa js/navigation-context.js real; só reproduz o mecanismo
// exato usado por stageContextData()/openDetailFromPlaylist() em
// index.html (context.songIds.map(...) + event.repertoire.find(...)).
//
// Não corrige nada. Roda isolado com:
//   node tests/production-stage-navigation-order-repro.test.js

const assert = require("node:assert/strict");

global.window = global;
require("../js/navigation-context.js");

const results = [];
function record(name, fn) {
  try { fn(); results.push({ name, status: "PASS" }); }
  catch (error) { results.push({ name, status: "FAIL", reason: error.message }); }
}

// Reproduz exatamente a lógica de stageContextData() em index.html: usa a
// ordem congelada em navigationContext, mas busca o item atual (fresco) em
// event.repertoire para cada songId.
function stageContextData(event) {
  const context = window.navigationContext.get();
  if (!context) return { songs: [] };
  const songs = context.songIds.map((songId) => event.repertoire.find((item) => String(item.songId) === String(songId))).filter(Boolean);
  return { context, songs };
}

record("navigationContext não reflete um reorder que acontece depois de setPlaylist (Modo Palco fica com ordem congelada)", () => {
  let event = { repertoire: [{ songId: "a" }, { songId: "b" }, { songId: "c" }, { songId: "d" }] };

  // Usuário abre o evento pela ordem original A,B,C,D (openDetailFromPlaylist).
  window.navigationContext.setPlaylist("event-1", event.repertoire.map((item) => item.songId), 0);
  const before = stageContextData(event).songs.map((item) => item.songId);
  assert.deepEqual(before, ["a", "b", "c", "d"], "pré-condição: ordem inicial deveria ser A,B,C,D");

  // Em segundo plano, um pull traz a nova ordem D,A,C,B (por exemplo, outro
  // dispositivo reordenou e essa sincronização chegou enquanto o usuário
  // continua na tela). Nada em index.html chama setPlaylist() de novo
  // automaticamente após um pull — só openDetailFromPlaylist() faz isso,
  // e o usuário não re-abriu a tela.
  event = { repertoire: [{ songId: "d" }, { songId: "a" }, { songId: "c" }, { songId: "b" }] };

  const after = stageContextData(event).songs.map((item) => item.songId);
  assert.deepEqual(after, ["d", "a", "c", "b"], "Modo Palco deveria refletir a ordem nova depois do pull, mas ficou congelado na ordem antiga");
});

record("reabrir a tela do evento (openDetailFromPlaylist) corrige a ordem congelada", () => {
  const event = { repertoire: [{ songId: "d" }, { songId: "a" }, { songId: "c" }, { songId: "b" }] };
  // Isso é o que openDetailFromPlaylist() faz ao ser chamado de novo.
  window.navigationContext.setPlaylist("event-1", event.repertoire.map((item) => item.songId), 0);
  const after = stageContextData(event).songs.map((item) => item.songId);
  assert.deepEqual(after, ["d", "a", "c", "b"], "reabrir a tela deveria corrigir a ordem");
});

const passed = results.filter((r) => r.status === "PASS").length;
const failed = results.filter((r) => r.status === "FAIL");
console.log("\n=== BUG 2 (achado adicional) — navigationContext congela a ordem ===");
results.forEach((r) => console.log(`[${r.status}] ${r.name}${r.status === "FAIL" ? "\n        -> " + r.reason : ""}`));
console.log(`\n${passed}/${results.length} passaram, ${failed.length} falharam.`);
process.exitCode = 0;
