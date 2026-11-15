// "Editar na versão da banda" tem que chegar na banda: a versão pessoal anterior à
// alteração do líder deixa de valer; a ajustada depois volta a valer.
const assert = require("node:assert/strict");
global.window = {};
require("../js/event-model.js");
const M = window.eventModel;
const base = (personalAt, notices) => ({
  id: "e1", title: "Avalanche", leaderId: "lider", members: [{ id: "lider" }, { id: "baixista" }],
  repertoire: [{ id: "r1", songId: "ai-1", order: 0,
    shared: { title: "Sublime", key: "D", chordSheet: "D Bm A G" },
    personalEdits: { baixista: { title: "Sublime", key: "C", chordSheet: "bagunçado", updatedAt: personalAt } } }],
  notifications: notices
});
const keyChange = (at, songId = "ai-1") => ({ id: "n" + at, kind: "repertoire.key.updated", changeType: "KEY_CHANGED", songId, createdAt: at });
let r = M.effectiveRepertoireItem(base("2026-11-14T10:00:00Z", [keyChange("2026-11-14T12:00:00Z")]), "r1", "baixista");
assert.equal(r.effective.scope, "shared", "edição da banda depois da cópia pessoal vale para o membro");
assert.equal(r.effective.key, "D");
r = M.effectiveRepertoireItem(base("2026-11-14T13:00:00Z", [keyChange("2026-11-14T12:00:00Z")]), "r1", "baixista");
assert.equal(r.effective.scope, "personal", "ajuste pessoal feito depois continua valendo");
r = M.effectiveRepertoireItem(base("2026-11-14T10:00:00Z", [keyChange("2026-11-14T12:00:00Z", "outra")]), "r1", "baixista");
assert.equal(r.effective.scope, "personal", "mudança em outra música não mexe nesta");
r = M.effectiveRepertoireItem(base("2026-11-14T10:00:00Z", [{ ...keyChange("2026-11-14T12:00:00Z"), changeType: "PERFORMANCE_NOTES_CHANGED" }]), "r1", "baixista");
assert.equal(r.effective.scope, "personal", "só observações não troca a versão");
console.log("event-band-edit-reaches-members.test.js: OK");
