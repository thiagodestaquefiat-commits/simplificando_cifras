// BUG 2 — músicas de um evento aparecem fora da ordem definida (produção,
// main 777849b).
//
// Reproduz o fluxo real evento -> repertório -> persistência -> backend ->
// pull -> frontend -> renderização usando js/event-model.js +
// js/event-repository.js + js/event-collaboration-client.js reais (via vm,
// um contexto por "dispositivo"), contra um servidor falso que reproduz o
// MESMO contrato validado em backend/tests/test_repertoire_order_repro.py:
// PUT completo reordena pela ordem do array enviado; PATCH de um item nunca
// toca em order/position.
//
// Não corrige nada. Roda isolado com:
//   node tests/production-event-order-repro.test.js

const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const eventModelSource = fs.readFileSync("js/event-model.js", "utf8");
const eventRepositorySource = fs.readFileSync("js/event-repository.js", "utf8");
const eventCollabSource = fs.readFileSync("js/event-collaboration-client.js", "utf8");

const results = [];
async function record(name, fn) {
  try { await fn(); results.push({ name, status: "PASS" }); }
  catch (error) { results.push({ name, status: "FAIL", reason: error.message }); }
}

function response(status, body) { return { ok: status >= 200 && status < 300, status, async json() { return structuredClone(body); } }; }

// Servidor falso compartilhado entre dispositivos: um único `events` Map,
// reproduzindo exatamente o comportamento real de
// backend/app/routes/events.py — PUT completo grava a ordem do array
// enviado (posição = índice), PATCH de /shared nunca mexe em order.
function createServer() {
  const events = new Map();
  async function fetch(url, options = {}) {
    const path = url.replace("https://api.test/api/collaboration", "");
    const method = options.method || "GET";
    if (path === "/users") {
      const body = JSON.parse(options.body);
      return response(201, { user: { id: body.id, name: body.name }, accessToken: "token-" + body.id });
    }
    if (path === "/me") {
      const token = String(options.headers.Authorization || "").replace("Bearer ", "");
      const userId = token.replace(/^token-/, "");
      return response(200, { id: userId, name: "Líder", avatarUrl: null });
    }
    if (path === "/events" && method === "GET") return response(200, { events: [...events.values()] });
    if (path === "/events" && method === "POST") {
      const body = JSON.parse(options.body);
      const stored = { ...body, remoteVersion: 1 };
      events.set(body.id, stored);
      return response(201, stored);
    }
    const putMatch = path.match(/^\/events\/([^/]+)$/);
    if (putMatch && method === "PUT") {
      const body = JSON.parse(options.body);
      const current = events.get(putMatch[1]);
      if (!current) return response(404, { erro: { codigo: "evento_nao_encontrado", mensagem: "не" } });
      if (body.remoteVersion != null && body.remoteVersion !== current.remoteVersion) return response(409, { erro: { codigo: "versao_desatualizada", mensagem: "Versão desatualizada." } });
      const stored = { ...body, remoteVersion: current.remoteVersion + 1 };
      events.set(putMatch[1], stored);
      return response(200, stored);
    }
    const patchMatch = path.match(/^\/events\/([^/]+)\/repertoire\/([^/]+)\/shared$/);
    if (patchMatch && method === "PATCH") {
      const [, eventId, itemId] = patchMatch;
      const current = events.get(eventId);
      if (!current) return response(404, { erro: {} });
      const body = JSON.parse(options.body);
      const repertoire = current.repertoire.map((item) => String(item.id) === String(itemId) ? { ...item, shared: { title: body.title, artist: body.artist, key: body.key, capo: body.capo, chordSheet: body.chordSheet, notes: body.notes } } : item);
      const stored = { ...current, repertoire, remoteVersion: current.remoteVersion + 1 };
      events.set(eventId, stored);
      return response(200, stored);
    }
    throw new Error("Rota inesperada no servidor falso: " + method + " " + path);
  }
  return { events, fetch };
}

function createDevice(server, userId) {
  const memory = new Map();
  const context = {
    window: null, console, structuredClone,
    storage: { get: (k, f) => (memory.has(k) ? structuredClone(memory.get(k)) : f), set: (k, v) => { memory.set(k, structuredClone(v)); return true; } },
    apiConfig: { collaborationEndpoint: (p) => "https://api.test/api/collaboration" + p },
    appAuth: { getState: () => ({ user: { id: userId } }), getAccessToken: () => "token-" + userId },
    fetch: server.fetch
  };
  context.window = context;
  vm.runInNewContext(eventModelSource, context);
  vm.runInNewContext(eventRepositorySource, context);
  vm.runInNewContext(eventCollabSource, context);
  return { context, model: context.window.eventModel, repository: context.window.eventRepository, collab: context.window.eventCollaboration };
}

function songIds(event) { return event.repertoire.map((item) => item.songId); }
const actor = (id) => ({ id, name: "Líder", role: "Liderança" });

(async () => {
  await record("Ordem sobrevive a criação -> pull em outro dispositivo -> reorder -> pull de novo", async () => {
    const server = createServer();
    const deviceA = createDevice(server, "leader-a");
    const deviceB = createDevice(server, "leader-a"); // mesma conta, outro dispositivo/aba

    const draft = deviceA.model.create({
      id: "event-order-real",
      title: "Culto",
      leaderId: "leader-a",
      members: [{ id: "leader-a", name: "Líder", isLeader: true }],
      repertoire: ["song-a", "song-b", "song-c", "song-d"].map((songId, index) => ({ id: "item-" + songId, songId, order: index, shared: { title: songId } }))
    });
    const createdOnA = await deviceA.collab.saveSharedEvent(draft, actor("leader-a"));
    assert.deepEqual(songIds(createdOnA), ["song-a", "song-b", "song-c", "song-d"], "ordem errada logo após criar");

    const pulledOnB = await deviceB.collab.listEvents(actor("leader-a"));
    assert.deepEqual(songIds(pulledOnB[0]), ["song-a", "song-b", "song-c", "song-d"], "dispositivo B recebeu ordem diferente da criada em A");

    // Dispositivo A reordena (como um drag-and-drop faria: recalcula order
    // de cada item pela nova posição no array) e resalva o evento inteiro.
    const reorderedItems = ["song-d", "song-a", "song-c", "song-b"].map((songId, index) => ({
      ...createdOnA.repertoire.find((item) => item.songId === songId),
      order: index
    }));
    const reorderedDraft = deviceA.model.create({ ...createdOnA, repertoire: reorderedItems });
    const resavedOnA = await deviceA.collab.saveSharedEvent(reorderedDraft, actor("leader-a"));
    assert.deepEqual(songIds(resavedOnA), ["song-d", "song-a", "song-c", "song-b"], "dispositivo A não conseguiu persistir a nova ordem");

    // Dispositivo B, que nunca soube do reorder, puxa de novo (abrir a aba
    // de Eventos) — precisa ver a ordem nova de A, não a antiga que ainda
    // está no seu `setlists` local.
    const pulledAgainOnB = await deviceB.collab.listEvents(actor("leader-a"));
    assert.deepEqual(songIds(pulledAgainOnB[0]), ["song-d", "song-a", "song-c", "song-b"], "pull em B não refletiu o reorder feito em A");

    // E o merge local (reconcileRemote), como index.html faz depois do
    // login, também precisa adotar a ordem nova em vez de manter a antiga
    // que já estava no `setlists` de B.
    const bLocalBeforeReconcile = [pulledOnB[0]]; // still holds the OLD order locally
    const reconciled = deviceB.repository.reconcileRemote(bLocalBeforeReconcile, pulledAgainOnB);
    assert.deepEqual(songIds(reconciled[0]), ["song-d", "song-a", "song-c", "song-b"], "reconcileRemote manteve a ordem antiga em vez de adotar a nova de A");
  });

  await record("PATCH de tom oficial (changeEventOfficialKey) não reordena o repertório de outro dispositivo", async () => {
    const server = createServer();
    const deviceA = createDevice(server, "leader-b");
    const draft = deviceA.model.create({
      id: "event-order-key",
      title: "Culto",
      leaderId: "leader-b",
      members: [{ id: "leader-b", name: "Líder", isLeader: true }],
      repertoire: ["song-a", "song-b", "song-c"].map((songId, index) => ({ id: "item-" + songId, songId, order: index, shared: { title: songId, key: "G" } }))
    });
    const created = await deviceA.collab.saveSharedEvent(draft, actor("leader-b"));
    const itemB = created.repertoire.find((item) => item.songId === "song-b");

    await deviceA.collab.saveSharedItem(created, itemB.id, { ...itemB.shared, key: "A" }, actor("leader-b"));

    const deviceC = createDevice(server, "leader-b");
    const pulledOnC = await deviceC.collab.listEvents(actor("leader-b"));
    assert.deepEqual(songIds(pulledOnC[0]), ["song-a", "song-b", "song-c"], "um PATCH de tom oficial alterou a ordem vista por outro dispositivo");
  });

  const passed = results.filter((r) => r.status === "PASS").length;
  const failed = results.filter((r) => r.status === "FAIL");
  console.log("\n=== BUG 2 — reprodução (ordem do repertório) ===");
  results.forEach((r) => console.log(`[${r.status}] ${r.name}${r.status === "FAIL" ? "\n        -> " + r.reason : ""}`));
  console.log(`\n${passed}/${results.length} passaram, ${failed.length} falharam.`);
  process.exitCode = 0;
})();
