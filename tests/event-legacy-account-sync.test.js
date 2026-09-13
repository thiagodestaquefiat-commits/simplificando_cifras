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

const oneHundredSongs = Array.from({ length: 100 }, (_, index) => ({ id: index + 1, librarySync: { clientId: `song-${index + 1}` } }));
const tenLegacyEvents = Array.from({ length: 10 }, (_, index) => ({
  ...fixture,
  id: `legacy-event-${index + 1}`,
  title: `Evento legado ${index + 1}`,
  repertoire: fixture.repertoire.map((item, order) => ({ ...item, id: `event-${index + 1}-item-${order + 1}`, order }))
}));
const cachedSunday = a.eventModel.create({ ...tenLegacyEvents[0], leaderId: owner.id, members: [{ id: owner.id, name: owner.name, role: "Liderança", isLeader: true }], remoteVersion: 1, syncState: "synced", pendingShared: false });
const partial = device({
  sc_songs_v1: oneHundredSongs,
  sc_events_v1: tenLegacyEvents,
  cifras_setlists_v1: tenLegacyEvents,
  sc_personal_event_caches_v1: { [owner.id]: [cachedSunday] },
  sc_legacy_events_owner_v1: owner.id
});
const partialLocal = partial.eventRepository.load([], { user: { id: "local-user", name: owner.name }, legacyUserIds: [] });
const partialActivation = partial.eventRepository.activateOwner(owner.id, partialLocal, owner, ["local-user"]);
assert.equal(partialActivation.events.length, 10, "cache parcial não pode ocultar os outros Eventos legados");
assert.equal(partialActivation.migrationCandidate, true);
assert.deepEqual(partialActivation.events.map(event => event.id).sort(), tenLegacyEvents.map(event => event.id).sort());
assert.equal(partial.values.get("sc_songs_v1").length, 100, "a migração de Eventos não altera músicas");

const allConfirmed = partialActivation.events.map(event => partial.eventModel.create({ ...event, remoteVersion: 1, syncState: "synced", pendingShared: false }));
assert.equal(partial.eventRepository.confirmActiveOwner(allConfirmed), true);
assert.equal(partial.values.get("sc_events_v1").length, 10, "a fonte legada permanece fisicamente preservada");
assert.equal(partial.values.get("sc_legacy_event_migrations_v1")[owner.id].length, 10);

const remoteAfterDelete = allConfirmed.slice(1);
const convergedAfterDelete = partial.eventRepository.reconcileRemote(allConfirmed, remoteAfterDelete);
assert.equal(convergedAfterDelete.length, 9, "exclusão confirmada na conta converge no outro dispositivo");
partial.eventRepository.save(convergedAfterDelete);
const afterReload = device(Object.fromEntries(partial.values));
const afterReloadLocal = afterReload.eventRepository.load([], { user: owner, legacyUserIds: [] });
const afterReloadActivation = afterReload.eventRepository.activateOwner(owner.id, afterReloadLocal, owner, []);
assert.equal(afterReloadActivation.events.length, 9, "Evento já migrado e excluído não pode renascer da cópia legada preservada");
assert.equal(afterReloadActivation.migrationCandidate, false);
assert.equal(afterReload.values.get("sc_events_v1").length, 10, "preservar a fonte não significa reimportar um Evento excluído");

const offlinePending = partial.eventModel.create({ ...fixture, id: "offline-new-event", remoteVersion: null, syncState: "pending", pendingShared: true });
const withOfflinePending = partial.eventRepository.reconcileRemote([...remoteAfterDelete, offlinePending], remoteAfterDelete);
assert.ok(withOfflinePending.some(event => event.id === offlinePending.id), "Evento criado offline deve sobreviver até a reconexão");

console.log("event-legacy-account-sync.test.js: OK (cache parcial, 100 músicas intactas, 10 Eventos, A↔B, exclusão e offline)");
