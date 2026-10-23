// Cenário real: o líder monta o repertório no celular, um membro aceita o
// convite (versão do evento sobe no servidor) e o envio do líder era recusado
// com "versao_desatualizada". O repertório precisa chegar ao servidor e o
// membro que entrou pelo convite não pode ser removido.
const assert = require("node:assert/strict");

const values = new Map();
const puts = [];
let userId = null;
let serverVersion = 3;
global.window = global;
global.storage = {
  get(key, fallback) { return values.has(key) ? structuredClone(values.get(key)) : fallback; },
  set(key, value) { values.set(key, structuredClone(value)); return true; }
};
global.apiConfig = { collaborationEndpoint: path => "https://api.example/api/collaboration" + path };
global.appAuth = { getState: () => ({ user: { id: userId } }), getAccessToken: () => null };

const joined = { id: "member-baixo", name: "Felipe", role: "Baixo" };
function serverEvent() {
  return {
    id: "event-1", title: "Culto de domingo", leaderId: userId, remoteVersion: serverVersion,
    members: [{ id: userId, name: "Você", role: "Liderança", isLeader: true }, joined],
    repertoire: []
  };
}
function response(status, body) { return { ok: status >= 200 && status < 300, status, async json() { return structuredClone(body); } }; }
global.fetch = async (url, options) => {
  if (url.endsWith("/users")) { userId = JSON.parse(options.body).id; return response(201, { user: { id: userId, name: "Você" }, accessToken: "token" }); }
  if (url.endsWith("/events/event-1") && options.method === "GET") return response(200, serverEvent());
  if (url.endsWith("/events/event-1") && options.method === "PUT") {
    const body = JSON.parse(options.body);
    puts.push(body);
    if (body.remoteVersion !== serverVersion) return response(409, { erro: { codigo: "versao_desatualizada", mensagem: "O repertório foi alterado por outra sessão." } });
    serverVersion += 1;
    return response(200, { ...body, remoteVersion: serverVersion });
  }
  throw new Error("Rota inesperada: " + options.method + " " + url);
};

require("../js/event-model.js");
require("../js/event-repository.js");
require("../js/event-collaboration-client.js");

(async () => {
  const identity = window.eventCollaboration.ensureLocalIdentity({ id: "local-user", name: "Você", role: "Liderança" });
  await window.eventCollaboration.ensureRegistered(identity.user);

  // Cópia do líder: versão antiga (1), sem o membro novo, com 2 músicas pendentes.
  const local = window.eventModel.create({
    id: "event-1", title: "Culto de domingo", leaderId: userId, remoteVersion: 1,
    syncState: "pending", pendingShared: true,
    members: [{ id: userId, name: "Você", role: "Liderança" }],
    repertoire: [
      { id: "item-1", songId: "song-1", order: 0, shared: { title: "Música 1", chordSheet: "G D Em C" } },
      { id: "item-2", songId: "song-2", order: 1, shared: { title: "Música 2", chordSheet: "C G Am F" } }
    ]
  });

  const saved = await window.eventCollaboration.saveSharedEvent(local, identity.user);
  assert.equal(puts.length, 2, "deve reenviar uma vez após o conflito de versão");
  const final = puts[1];
  assert.equal(final.remoteVersion, 3, "reenvio usa a versão atual do servidor");
  assert.equal(final.repertoire.length, 2, "o repertório do líder chega ao servidor");
  assert.ok(final.members.some(m => m.id === "member-baixo"), "o membro que aceitou o convite continua no evento");
  assert.equal(saved.repertoire.length, 2);

  // Se o envio falhar, a cópia do líder não pode ser trocada pela do servidor (vazia).
  const merged = window.eventRepository.reconcileRemote([local], [serverEvent()]);
  assert.equal(merged.find(e => e.id === "event-1").repertoire.length, 2, "repertório pendente do líder é preservado");

  console.log("event-leader-version-conflict.test.js: OK");
})().catch(error => { console.error(error); process.exit(1); });
