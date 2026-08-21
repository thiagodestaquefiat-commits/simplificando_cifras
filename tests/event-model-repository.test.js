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

const result = window.eventRepository.upsert(events, { ...changed, location: "Igreja Central", members: [{ id: "local-user", name: "João", role: "Guitarra" }] });
assert.equal(result.created, false);
assert.equal(result.event.location, "Igreja Central");
assert.equal(window.eventModel.canAccess(result.event, "local-user"), true);
assert.equal(window.eventModel.canAccess(result.event, "intruso"), false);
assert.equal(window.eventRepository.save(result.events), true);
assert.equal(values.get("cifras_setlists_v1")[0].location, "Igreja Central");

console.log("event-model-repository.test.js: OK");
