const assert = require("node:assert/strict");

const values = new Map();
const requests = [];
let registeredUserId = null;
global.window = global;
global.storage = {
  get(key, fallback) { return values.has(key) ? structuredClone(values.get(key)) : fallback; },
  set(key, value) { values.set(key, structuredClone(value)); return true; }
};
global.apiConfig = { collaborationEndpoint: path => "https://api.example/api/collaboration" + path };
global.fetch = async (url, options) => {
  requests.push({ url, options });
  if (url.endsWith("/users")) { registeredUserId = JSON.parse(options.body).id; return response(201, { user: { id: registeredUserId, name: "Você" }, accessToken: "secret-token" }); }
  if (url.endsWith("/events") && options.method === "POST") return response(201, remoteEvent());
  if (url.endsWith("/events") && options.method === "GET") return response(200, { events: [remoteEvent()] });
  if (url.includes("/repertoire/item-1/personal") && ["PUT", "DELETE"].includes(options.method)) return response(200, remoteEvent());
  throw new Error("Rota inesperada: " + url);
};

function response(status, body) { return { ok: status >= 200 && status < 300, status, async json() { return structuredClone(body); } }; }
function remoteEvent() {
  return {
    id: "event-1", title: "Culto", leaderId: registeredUserId, remoteVersion: 1,
    members: [{ id: registeredUserId, name: "Você", role: "Liderança", isLeader: true }],
    repertoire: [{ id: "item-1", songId: "song-1", order: 0, shared: { key: "G", notes: "Oficial" }, personal: { key: "A", notes: "Pessoal" } }]
  };
}

require("../js/event-model.js");
require("../js/event-collaboration-client.js");

(async () => {
  const identity = window.eventCollaboration.ensureLocalIdentity({ id: "local-user", name: "Você", role: "Liderança" });
  assert.match(identity.user.id, /^user_/);
  await window.eventCollaboration.ensureRegistered(identity.user);
  const local = window.eventModel.create({
    ...remoteEvent(), remoteVersion: null,
    repertoire: [{ id: "item-1", songId: "song-1", shared: { key: "G", notes: "Oficial" }, personalEdits: { [identity.user.id]: { key: "A", notes: "Privado" }, outro: { key: "B", notes: "Nunca enviar" } } }]
  });
  const payload = window.eventCollaboration.toRemotePayload(local);
  assert.equal("personalEdits" in payload.repertoire[0], false, "overrides pessoais não podem integrar payload compartilhado");
  const legacySongId = "Na Sua Estante / Pitty (versão local)";
  for (const id of [1, 86, "1", "86", " música local ", "scid64_MQ", "song-personal", "team:abc", "550e8400-e29b-41d4-a716-446655440000"]) {
    const remoteId = window.eventCollaboration.toRemoteSongId(id);
    assert.match(remoteId, /^[A-Za-z0-9_.:-]{3,120}$/);
    assert.equal(String(window.eventCollaboration.fromRemoteSongId(remoteId)), String(id));
  }
  assert.throws(() => window.eventCollaboration.toRemotePayload({ repertoire: [{ id: "item-missing" }] }), error => error.code === "song_id_ausente");
  assert.throws(() => window.eventCollaboration.toRemoteSongId("x".repeat(121)), error => error.code === "song_id_local_incompativel");
  const encodedSongId = window.eventCollaboration.toRemoteSongId(legacySongId);
  assert.match(encodedSongId, /^scid64_[A-Za-z0-9_-]+$/);
  assert.equal(window.eventCollaboration.fromRemoteSongId(encodedSongId), legacySongId);
  const legacyPayload = window.eventCollaboration.toRemotePayload(window.eventModel.create({
    ...local,
    repertoire: [{ id: "item-legacy", songId: legacySongId, shared: { title: "Na Sua Estante", artist: "Pitty" } }]
  }));
  assert.equal(legacyPayload.repertoire[0].songId, encodedSongId, "ID local incompatível deve ser codificado antes do envio");
  assert.equal(window.eventCollaboration.fromRemote({ ...remoteEvent(), repertoire: legacyPayload.repertoire }).repertoire[0].songId, legacySongId, "retorno remoto deve recuperar o ID local original");
  const saved = await window.eventCollaboration.saveSharedEvent(local, identity.user);
  assert.equal(saved.syncState, "synced");
  assert.deepEqual(Object.keys(saved.repertoire[0].personalEdits), [identity.user.id]);
  assert.equal(saved.repertoire[0].personalEdits[identity.user.id].key, "A");
  assert.equal(Object.keys(saved.repertoire[0].personalEdits).length, 1, "cliente recebe apenas o override do usuário autenticado");
  assert.equal(requests.at(-1).options.headers.Authorization, "Bearer secret-token");
  assert.equal((await window.eventCollaboration.listEvents(identity.user)).length, 1);
  window.eventCollaboration.queuePersonalOperation("event-1", "item-1", "upsert", { key: "B", notes: "Offline" });
  window.eventCollaboration.queuePersonalOperation("event-1", "item-1", "delete");
  assert.equal(window.eventCollaboration.readPersonalQueue().length, 1, "a operação mais recente substitui a anterior");
  assert.equal(window.eventCollaboration.readPersonalQueue()[0].action, "delete");
  assert.equal((await window.eventCollaboration.flushPersonalQueue(identity.user)).length, 1);
  assert.equal(window.eventCollaboration.readPersonalQueue().length, 0);
  console.log("event-collaboration-client.test.js: OK (identidade, token, isolamento pessoal, payload e fila offline)");
})().catch((error) => { console.error(error); process.exitCode = 1; });
