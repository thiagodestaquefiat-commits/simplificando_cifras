const assert = require("node:assert/strict");
const fixture = require("./fixtures/legacy-event.json");

function device(initial) {
  const values = new Map(Object.entries(initial || {}).map(([key, value]) => [key, structuredClone(value)]));
  const scope = { storage: {
    get(key, fallback) { return values.has(key) ? structuredClone(values.get(key)) : fallback; },
    set(key, value) { values.set(key, structuredClone(value)); return true; }
  }};
  global.window = scope;
  delete require.cache[require.resolve("../js/event-model.js")];
  delete require.cache[require.resolve("../js/event-repository.js")];
  require("../js/event-model.js");
  require("../js/event-repository.js");
  return { ...scope, values };
}

const owner = { id: "account-a", name: "Thiago" };
const a = device({ cifras_setlists_v1: [fixture] });
const local = a.eventRepository.load([], { user: { id: "local-user", name: "Thiago" }, legacyUserIds: [] });
const activation = a.eventRepository.activateOwner(owner.id, local, owner, ["local-user"]);
assert.equal(activation.migrationCandidate, true);
assert.equal(activation.events[0].id, fixture.id);
assert.equal(activation.events[0].leaderId, owner.id);
assert.deepEqual(activation.events[0].repertoire.map(item => item.songId), [86, 12, 41]);
assert.deepEqual(activation.events[0].repertoire.map(item => item.id), ["repertoire_3", "repertoire_1", "repertoire_2"]);
assert.equal(activation.events[0].members[1].name, "Sabrina");
assert.equal(activation.events[0].eventLocation.placeId, "legacy-place-1");
assert.equal(activation.events[0].notifications[0].id, "legacy-notice-1");
assert.deepEqual(a.values.get("cifras_setlists_v1"), [fixture], "a fonte legada não pode ser removida antes da confirmação");

const cloud = structuredClone(activation.events).map(event => a.eventModel.create({ ...event, remoteVersion: 1, syncState: "synced", pendingShared: false }));
assert.equal(a.eventRepository.confirmActiveOwner(cloud), true);
const b = device({ sc_personal_event_caches_v1: { [owner.id]: cloud }, sc_legacy_events_owner_v1: owner.id });
const received = b.eventRepository.activateOwner(owner.id, [], owner, []);
assert.equal(received.events.length, 1);
assert.deepEqual(received.events[0].repertoire.map(item => item.songId), [86, 12, 41]);

const reordered = b.eventModel.create({ ...received.events[0], title: "Culto atualizado no PC", repertoire: [{ ...received.events[0].repertoire[2], order: 0 }, { ...received.events[0].repertoire[0], order: 1 }], remoteVersion: 2, syncState: "synced", pendingShared: false });
const cloudUpdated = b.eventRepository.upsert(received.events, reordered).events;
assert.deepEqual(cloudUpdated[0].repertoire.map(item => item.songId), [41, 86]);
assert.equal(cloudUpdated[0].title, "Culto atualizado no PC");
const library = [{ id: 12 }, { id: 41 }, { id: 86 }];
assert.equal(b.eventRepository.remove(cloudUpdated, fixture.id).length, 0);
assert.deepEqual(library.map(song => song.id), [12, 41, 86], "excluir evento não pode apagar músicas");

console.log("event-legacy-account-sync.test.js: OK (cópia, IDs, ordem, A→cloud→B, atualização e exclusão segura)");
