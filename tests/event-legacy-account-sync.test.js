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

(async () => {
  const batchDevice = device({ sc_events_v1: tenLegacyEvents, cifras_setlists_v1: tenLegacyEvents });
  const batchLocal = batchDevice.eventRepository.load([], { user: { id: "historical-account", name: owner.name }, legacyUserIds: [] });
  const batchActivation = batchDevice.eventRepository.activateOwner(owner.id, batchLocal, owner, ["historical-account"]);
  const server = new Map();
  const attempts = [];
  const failures = [];
  const result = await batchDevice.eventRepository.uploadMigrationCandidates(batchActivation.events, [], async event => {
    attempts.push(event.id);
    if (event.id === "legacy-event-2") {
      const error = new Error("Campo legado inválido.");
      Object.assign(error, { status: 400, code: "entrada_invalida", requestId: "request-legacy-2" });
      throw error;
    }
    const remote = batchDevice.eventModel.create({ ...event, remoteVersion: 1, syncState: "synced", pendingShared: false });
    server.set(event.id, remote);
    return remote;
  }, failure => failures.push(failure));
  assert.equal(attempts.length, 10, "um 400 não pode impedir as tentativas dos Eventos seguintes");
  assert.deepEqual([...server.keys()], ["legacy-event-1", "legacy-event-3", "legacy-event-4", "legacy-event-5", "legacy-event-6", "legacy-event-7", "legacy-event-8", "legacy-event-9", "legacy-event-10"]);
  assert.equal(result.failures.length, 1);
  assert.deepEqual(failures[0], { eventId: "legacy-event-2", status: 400, code: "entrada_invalida", message: "Campo legado inválido.", requestId: "request-legacy-2" });

  const partialRemote = [...server.values()];
  const afterPartialUpload = batchDevice.eventRepository.reconcileRemote(batchActivation.events, partialRemote);
  const failedLocal = afterPartialUpload.find(event => event.id === "legacy-event-2");
  assert.ok(failedLocal, "Evento recusado precisa permanecer local");
  assert.equal(failedLocal.syncState, "pending");
  assert.equal(batchDevice.eventRepository.save(afterPartialUpload), true);

  const afterPartialReload = device(Object.fromEntries(batchDevice.values));
  const reloadedLocal = afterPartialReload.eventRepository.load([], { user: owner, legacyUserIds: [] });
  const reloadedActivation = afterPartialReload.eventRepository.activateOwner(owner.id, reloadedLocal, owner, ["historical-account"]);
  assert.equal(reloadedActivation.migrationCandidate, true, "falha precisa continuar elegível depois do reload");
  assert.ok(reloadedActivation.events.some(event => event.id === "legacy-event-2"));
  const retry = await afterPartialReload.eventRepository.uploadMigrationCandidates(reloadedActivation.events, partialRemote, async event => {
    const remote = afterPartialReload.eventModel.create({ ...event, remoteVersion: 1, syncState: "synced", pendingShared: false });
    server.set(event.id, remote);
    return remote;
  });
  assert.deepEqual(retry.uploaded.map(event => event.id), ["legacy-event-2"], "reconexão deve tentar novamente somente o ID ainda ausente");

  const cacheOnlyEvent = batchDevice.eventModel.create({ ...tenLegacyEvents[0], leaderId: owner.id, members: [{ id: owner.id, name: owner.name, role: "Liderança", isLeader: true }], remoteVersion: 1, syncState: "synced", pendingShared: false });
  const cacheOnly = device({
    sc_events_v1: [tenLegacyEvents[0]],
    cifras_setlists_v1: [tenLegacyEvents[0]],
    sc_personal_event_caches_v1: { [owner.id]: [cacheOnlyEvent] },
    sc_legacy_events_owner_v1: owner.id
  });
  const cacheOnlyLocal = cacheOnly.eventRepository.load([], { user: { id: "historical-account", name: owner.name }, legacyUserIds: [] });
  const cacheOnlyActivation = cacheOnly.eventRepository.activateOwner(owner.id, cacheOnlyLocal, owner, ["historical-account"]);
  assert.equal(cacheOnlyActivation.migrationCandidate, true, "cache local sem confirmação remota não pode concluir o ledger");
  assert.equal(cacheOnly.values.has("sc_legacy_event_migrations_v1"), false);

  const cleanDeviceB = device({});
  const cleanLocalB = cleanDeviceB.eventRepository.load([], { user: owner, legacyUserIds: [] });
  const cleanActivationB = cleanDeviceB.eventRepository.activateOwner(owner.id, cleanLocalB, owner, []);
  const receivedOnB = cleanDeviceB.eventRepository.reconcileRemote(cleanActivationB.events, [...server.values()]);
  assert.equal(receivedOnB.length, 10, "segundo dispositivo deve receber todos os Eventos confirmados da conta");
  assert.deepEqual(receivedOnB.map(event => event.id).sort(), tenLegacyEvents.map(event => event.id).sort());
  assert.equal(batchDevice.values.get("sc_songs_v1"), undefined, "hotfix de Eventos não pode criar ou alterar biblioteca musical");

  console.log("event-legacy-hotfix: OK (A–E: lote tolerante, bootstrap coberto por fonte, ledger remoto, A↔B e nova tentativa)");
})().catch(error => { console.error(error); process.exitCode = 1; });
