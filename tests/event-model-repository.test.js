const assert = require("node:assert/strict");

const values = new Map([["cifras_setlists_v1", [{ id: 7, title: "Culto", date: "20/08/2026", musicas: [1, 2] }]]]);
global.window = {
  storage: {
    get(key, fallback) { return values.has(key) ? structuredClone(values.get(key)) : fallback; },
    set(key, value) { values.set(key, structuredClone(value)); return true; }
  }
};

require("../js/event-model.js");
require("../js/event-repository.js");

const events = window.eventRepository.load([]);
assert.equal(events.length, 1);
assert.equal(events[0].repertoire.length, 2);
assert.deepEqual(events[0].musicas, [1, 2]);
assert.ok(values.has("sc_events_v1"), "migração deve criar a coleção atual");

const changed = window.eventModel.withSharedChange(events[0], { id: "local-user", name: "João" }, "event.updated", "alterou o repertório");
assert.equal(changed.notifications.at(-1).actorName, "João");
assert.match(changed.notifications.at(-1).summary, /repertório/);

const result = window.eventRepository.upsert(events, { ...changed, location: "Igreja Central", eventLocation: { formattedAddress: "Rua das Flores, 100", latitude: -26.9187, longitude: -49.066, placeId: "place-1", provider: "geoapify" }, members: [{ id: "local-user", name: "João", role: "Guitarra" }] });
assert.equal(result.created, false);
assert.equal(result.event.location, "Igreja Central");
assert.equal(result.event.eventLocation.placeId, "place-1");
assert.equal(result.event.eventLocation.latitude, -26.9187);
assert.equal(window.eventModel.canAccess(result.event, "local-user"), true);
assert.equal(window.eventModel.canAccess(result.event, "intruso"), false);
assert.equal(window.eventRepository.save(result.events), true);
assert.equal(values.get("cifras_setlists_v1")[0].location, "Igreja Central");
assert.equal(values.get("cifras_setlists_v1")[0].eventLocation.longitude, -49.066);

const collaborative = window.eventModel.create({
  id: "event-permissions",
  title: "Ensaio",
  leaderId: "leader",
  members: [
    { id: "leader", name: "Líder", role: "Violão", isLeader: true },
    { id: "member", name: "Integrante", role: "Vocal" }
  ],
  repertoire: [{ id: "item-1", songId: 1, shared: { key: "G", notes: "Oficial" } }]
});
assert.equal(window.eventModel.isLeader(collaborative, "leader"), true);
assert.equal(window.eventModel.canEditShared(collaborative, "member"), false);
assert.throws(() => window.eventModel.applySharedEdit(collaborative, "item-1", "member", { key: "D" }), /Somente o líder/);
const personal = window.eventModel.applyPersonalEdit(collaborative, "item-1", "member", { title: "Versão pessoal", artist: "Equipe", key: "A", capo: "0", chordSheet: "Verso\nA D E", notes: "Minha voz" });
assert.equal(personal.repertoire[0].shared.key, "G");
assert.equal(personal.repertoire[0].personalEdits.member.key, "A");
assert.equal(personal.repertoire[0].personalEdits.member.title, "Versão pessoal");
assert.match(personal.repertoire[0].personalEdits.member.chordSheet, /A D E/);
assert.equal(window.eventModel.effectiveRepertoireItem(personal, "item-1", "member").effective.scope, "personal");
assert.equal(window.eventModel.effectiveRepertoireItem(personal, "item-1", "leader").effective.key, "G");
const official = window.eventModel.applySharedEdit(personal, "item-1", "leader", { title: "Versão oficial", artist: "Banda", key: "D", capo: "2", chordSheet: "Refrão\nD G A", notes: "Novo oficial" });
assert.equal(official.repertoire[0].personalEdits.member.key, "A", "alteração compartilhada deve preservar override pessoal");
assert.equal(official.repertoire[0].shared.title, "Versão oficial");
assert.throws(() => window.eventRepository.upsertShared([collaborative], { ...collaborative, title: "Inválido" }, { id: "member" }), /Somente o líder/);

console.log("event-model-repository.test.js: OK");
