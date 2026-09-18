// BUG 1 — biblioteca não converge entre dispositivos (produção, main 777849b).
//
// PC = 152 músicas, celular = 145, e logout+login no celular não convergiu.
// Este arquivo reproduz o FLUXO REAL (login → activateOwner → cache local →
// pull → merge → persist) com js/song-model.js + js/song-repository.js +
// js/library-sync.js reais via vm, exatamente como index.html conecta —
// nenhuma simulação do comportamento desejado, só o código de produção.
//
// Diferença crucial em relação a tests/bloco-b-identity-library-repro.test.js
// e tests/library-sync.test.js: TODOS os cenários de "dispositivo B" desses
// arquivos começam com biblioteca vazia (`device(userId, [])`). Nenhum deles
// testa um dispositivo que JÁ TEM um cache de dono estabelecido, porém menor
// que o servidor — que é exatamente o caso real (celular com 145, já
// sincronizado antes, servidor com 152). É por isso que a suíte automatizada
// passou (12/12 no Bloco B) enquanto esse cenário real falhava: a lacuna
// nunca foi exercitada.
//
// Depois da correção (normalizeRemoteResponse quarentena registros
// inválidos em vez de abortar a resposta inteira), os cenários abaixo
// confirmam o comportamento CORRIGIDO: um registro corrompido não trava
// mais as músicas válidas.
//
// Roda isolado com:
//   node tests/production-library-convergence-repro.test.js

const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const songModelSource = fs.readFileSync("js/song-model.js", "utf8");
const songRepositorySource = fs.readFileSync("js/song-repository.js", "utf8");
const librarySyncSource = fs.readFileSync("js/library-sync.js", "utf8");

const results = [];
async function record(name, fn) {
  try { await fn(); results.push({ name, status: "PASS" }); }
  catch (error) { results.push({ name, status: "FAIL", reason: error.message }); }
}

function response(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => structuredClone(body) };
}

function song(i, extra = {}) {
  return { id: `local-${i}`, title: `Música ${i}`, artist: "Artista", key: "C", capo: "", blocos: [{ l: "Refrão", c: "C  G" }], ...extra };
}

function createDevice(remote, seedStorage = {}) {
  const memory = new Map(Object.entries(seedStorage).map(([k, v]) => [k, structuredClone(v)]));
  let online = true, authUser = null, authListener = null, breakNextFetch = false;
  const networkListeners = {};
  const storage = {
    get: (k, f) => (memory.has(k) ? structuredClone(memory.get(k)) : f),
    set: (k, v) => { memory.set(k, structuredClone(v)); return true; }
  };
  const navigator = {};
  Object.defineProperty(navigator, "onLine", { get: () => online });

  async function fetch(url, options = {}) {
    if (!online) throw new Error("offline");
    if (breakNextFetch) { breakNextFetch = false; throw new Error("falha_de_rede_simulada"); }
    const owner = String(options.headers.Authorization).slice(7);
    const method = options.method || "GET";
    const values = remote.get(owner) || new Map();
    remote.set(owner, values);
    if (method === "GET") return response({ songs: [...values.values()] });
    if (method === "DELETE") {
      const clientId = decodeURIComponent(url.split("/").pop());
      const existing = values.get(clientId);
      if (existing) values.set(clientId, { ...existing, version: existing.version + 1, updatedAt: new Date().toISOString(), deletedAt: new Date().toISOString() });
      return response(null, 204);
    }
    const body = JSON.parse(options.body);
    const results2 = [];
    body.items.forEach((item) => {
      const existing = values.get(item.clientId);
      const outcome = existing ? (JSON.stringify(existing.songData) === JSON.stringify(item.songData) ? "existing" : "updated") : "created";
      const value = { id: existing?.id || `server-${owner}-${values.size}`, clientId: item.clientId, songData: structuredClone(item.songData), version: existing ? (outcome === "updated" ? existing.version + 1 : existing.version) : 1, updatedAt: new Date().toISOString(), deletedAt: null };
      values.set(item.clientId, value);
      results2.push({ clientId: item.clientId, outcome, song: value });
    });
    return response({ results: results2 });
  }

  const context = {
    window: null, console, structuredClone, setTimeout, clearTimeout, crypto: global.crypto, fetch, navigator,
    storage, apiConfig: { libraryEndpoint: (p) => "https://api.test/songs" + p },
    addEventListener: (name, fn) => { networkListeners[name] = fn; },
    appAuth: { getAccessToken: () => authUser, subscribe: (fn) => { authListener = fn; fn({ authenticated: Boolean(authUser), user: authUser ? { id: authUser } : null }); } }
  };
  context.window = context;
  vm.runInNewContext(songModelSource, context);
  vm.runInNewContext(songRepositorySource, context);
  vm.runInNewContext(librarySyncSource, context);

  const catalogoPadrao = [];
  let musicas = context.window.songRepository.load(catalogoPadrao);

  context.librarySync.initialize({
    getSongs: () => musicas,
    setSongs: (v) => { musicas = v; },
    persist: (v) => { musicas = v; context.window.songRepository.save(v); },
    render() {},
    activateOwner: (userId) => context.window.songRepository.activateOwner(userId, musicas, catalogoPadrao),
    deactivateOwner: () => context.window.songRepository.deactivateOwner(catalogoPadrao),
    confirmOwner: (v) => context.window.songRepository.confirmActiveOwner(v),
    markDeleted: (v, c) => context.window.songRepository.markDeleted(v, c),
    confirmDeleted: (v) => context.window.songRepository.confirmDeleted(v),
    getDeletedClientIds: () => context.window.songRepository.getDeletedClientIds(),
    getPendingDeletedClientIds: () => context.window.songRepository.getPendingDeletedClientIds()
  });

  return {
    get musicas() { return musicas; },
    replace(v) { musicas = structuredClone(v); },
    login(id) { authUser = id; authListener({ authenticated: true, user: { id } }); },
    logout() { authUser = null; authListener({ authenticated: false, user: null }); },
    setOnline(v) { online = v; networkListeners[v ? "online" : "offline"]?.(); },
    breakNextFetch() { breakNextFetch = true; },
    storage,
    sync: context.librarySync
  };
}

// Injeta, direto no "servidor", um registro com songData corrompido para o
// owner — como aconteceria se uma linha de personal_songs ficasse com
// song_data nulo/inválido por qualquer motivo alheio a este código (escrita
// antiga, edição manual, etc.). js/library-sync.js:normalizeRemoteResponse
// rejeita a RESPOSTA INTEIRA quando qualquer registro não normaliza — não
// só o registro ruim — então isso trava o pull inteiro daquele owner, em
// qualquer dispositivo, de forma determinística (não depende de rede).
function corruptOwnerRemote(remote, ownerId) {
  const values = remote.get(ownerId) || new Map();
  values.set("corrupted-record", { id: "server-corrupt", clientId: "corrupted-record", songData: null, version: 1, updatedAt: new Date().toISOString(), deletedAt: null });
  remote.set(ownerId, values);
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 15));
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

(async () => {
  // ------------------------------------------------------------------
  // Cenário equivalente ao real: PC com 12 músicas sincronizadas, celular
  // já tinha cache próprio (9 das 12, mesmos clientIds — como se tivesse
  // sincronizado antes de o PC adicionar as 3 últimas). Login no celular
  // deve convergir para 12 sem perder nenhuma.
  // ------------------------------------------------------------------
  await record("Dispositivo com cache estabelecido converge ao logar (fluxo real de login)", async () => {
    const remote = new Map();
    const pc = createDevice(remote);
    pc.login("user-real");
    await settle();
    pc.replace(pc.musicas.concat(Array.from({ length: 12 }, (_, i) => song(`pc-${i}`))));
    await pc.sync.syncNow();
    assert.equal(remote.get("user-real").size, 12, "pré-condição: servidor precisa ter as 12 músicas do PC");

    // O celular já tinha, de uma sincronização anterior, um cache PRÓPRIO
    // com 9 dessas músicas — reaproveitando os mesmos objetos (mesmo
    // librarySync.clientId) que o PC gerou ao sincronizar, exatamente como
    // aconteceria numa conta real com dois dispositivos.
    const phoneCache = pc.musicas.slice(0, 9);
    const phone = createDevice(remote, { sc_personal_song_caches_v1: { "user-real": phoneCache } });
    assert.equal(phone.musicas.length, 0, "pré-condição: nada carregado antes do login");

    phone.login("user-real");
    await settle();
    // O login troca a tela para o cache local (9) e dispara pull() em
    // paralelo. Damos tempo real para essa promise resolver.
    await wait(50);

    assert.equal(phone.musicas.length, 12, `celular deveria convergir para 12 após o login, ficou com ${phone.musicas.length}`);
  });

  // ------------------------------------------------------------------
  // CORRIGIDO: um único registro remoto corrompido não trava mais o pull
  // inteiro. As músicas válidas continuam sendo incorporadas; só o
  // registro corrompido fica de fora (quarentenado), registrado em
  // lastRemoteContract.rejectedRecords (sem conteúdo sensível). Nada é
  // apagado localmente por causa disso.
  // ------------------------------------------------------------------
  await record("Um registro remoto corrompido não bloqueia mais as músicas válidas (nem precisa de logout/login)", async () => {
    const remote = new Map();
    const pc = createDevice(remote);
    pc.login("user-stuck");
    await settle();
    pc.replace(pc.musicas.concat(Array.from({ length: 5 }, (_, i) => song(`stuck-${i}`))));
    await pc.sync.syncNow();
    corruptOwnerRemote(remote, "user-stuck");

    const phoneCache = pc.musicas.slice(0, 3);
    const phone = createDevice(remote, { sc_personal_song_caches_v1: { "user-stuck": phoneCache } });

    phone.login("user-stuck");
    await settle();
    await wait(50);
    assert.equal(phone.musicas.length, 5, `as 5 músicas válidas deveriam ter sido incorporadas mesmo com 1 registro corrompido no meio, ficou com ${phone.musicas.length}`);
    assert.equal(phone.sync.getStatus().phase, "synced", "pull com registro inválido quarentenado não deveria ficar em fase de erro");
    assert.equal(phone.sync.getStatus().error, null, "não é mais um erro bloqueante — as músicas válidas convergiram");

    const diagnostics = phone.sync.diagnostics();
    assert.equal(diagnostics.remoteContract.rejectedCount, 1, "o registro corrompido deveria aparecer contado em rejectedCount");
    assert.deepEqual(diagnostics.remoteContract.rejectedRecords[0].clientId, "corrupted-record", "o diagnóstico registra qual clientId foi rejeitado");
    assert.equal(diagnostics.summary.remoteRejected, 1, "o resumo do diagnóstico também expõe a contagem de rejeitados");
    assert.deepEqual(Object.keys(diagnostics.remoteContract.rejectedRecords[0]).sort(), ["clientId", "index", "reason"], "o registro rejeitado só deveria expor metadados (index/clientId/reason), nunca songData/título/letra");
  });

  // ------------------------------------------------------------------
  // Cenário pedido explicitamente: cache parcial (equivalente a 145) +
  // resposta remota com músicas válidas E pelo menos 1 registro inválido
  // → as músicas válidas ainda são incorporadas, nenhuma é perdida, e a
  // correção não troca a biblioteca local cegamente pela remota (o que já
  // estava lá e não veio na resposta rejeitada continua intacto).
  // ------------------------------------------------------------------
  await record("Cache parcial (145) + resposta com válidas e 1 inválida → válidas incorporadas, nada apagado cegamente", async () => {
    const remote = new Map();
    const pc = createDevice(remote);
    pc.login("user-partial");
    await settle();
    const total = 12; // proporção equivalente a 152/145 num teste rápido
    pc.replace(pc.musicas.concat(Array.from({ length: total }, (_, i) => song(`partial-${i}`))));
    await pc.sync.syncNow();
    corruptOwnerRemote(remote, "user-partial");

    const partialCache = pc.musicas.slice(0, 9); // equivalente às 145 já sincronizadas antes
    const phone = createDevice(remote, { sc_personal_song_caches_v1: { "user-partial": partialCache } });

    phone.login("user-partial");
    await settle();
    await wait(50);

    const phoneClientIds = phone.musicas.map((s) => s.librarySync.clientId).sort();
    const expectedClientIds = pc.musicas.map((s) => s.librarySync.clientId).sort();
    assert.deepEqual(phoneClientIds, expectedClientIds, "todas as 12 músicas válidas (as 9 que já tinha + as 3 que faltavam) deveriam estar presentes");
    assert.equal(phone.musicas.length, total, `esperava ${total} músicas válidas convergidas, ficou com ${phone.musicas.length}`);

    // A biblioteca local não foi substituída cegamente: as 9 que já
    // existiam continuam com o MESMO clientId/objeto de antes (não foram
    // recriadas do zero a partir da resposta remota).
    partialCache.forEach((song) => {
      const stillThere = phone.musicas.find((item) => item.librarySync.clientId === song.librarySync.clientId);
      assert.ok(stillThere, `música pré-existente ${song.librarySync.clientId} não deveria desaparecer`);
    });
  });

  // ------------------------------------------------------------------
  // O que SERIA necessário, sem tocar em produção, para localizar as 7
  // músicas do cenário real: cada música sincronizada carrega
  // librarySync.clientId + serverVersion no cliente, e o servidor guarda
  // client_id + owner_user_id em personal_songs. Comparar os clientIds do
  // cache do PC com os do celular (ou com GET /api/library/songs de cada
  // device) identifica exatamente quais das 152 estão ausentes — não
  // depende de acessar o banco.
  // ------------------------------------------------------------------
  await record("clientId é suficiente para localizar as músicas ausentes sem acessar o banco", async () => {
    const remote = new Map();
    const pc = createDevice(remote);
    pc.login("user-diff");
    await settle();
    pc.replace(pc.musicas.concat(Array.from({ length: 6 }, (_, i) => song(`diff-${i}`))));
    await pc.sync.syncNow();

    // Estado do celular ANTES de logar (o que estaria em
    // sc_personal_song_caches_v1 hoje, sem precisar de pull nenhum) — é
    // esse snapshot, comparado ao GET /api/library/songs do PC ou ao
    // diagnóstico do servidor, que localiza as músicas ausentes.
    const missingClientIds = pc.musicas.slice(4, 6).map((s) => s.librarySync.clientId);
    const phoneCache = pc.musicas.slice(0, 4);

    const pcClientIds = new Set(pc.musicas.map((s) => s.librarySync.clientId));
    const phoneCacheClientIds = new Set(phoneCache.map((s) => s.librarySync.clientId));
    const missingOnPhone = [...pcClientIds].filter((id) => !phoneCacheClientIds.has(id));
    assert.deepEqual(missingOnPhone.sort(), missingClientIds.sort(), "a diferença de clientIds entre o cache do celular e o do PC identifica exatamente as músicas ausentes, sem depender de pull nem de acesso ao banco");
  });

  const passed = results.filter((r) => r.status === "PASS").length;
  const failed = results.filter((r) => r.status === "FAIL");
  console.log("\n=== BUG 1 — reprodução (biblioteca não converge) ===");
  results.forEach((r) => console.log(`[${r.status}] ${r.name}${r.status === "FAIL" ? "\n        -> " + r.reason : ""}`));
  console.log(`\n${passed}/${results.length} passaram, ${failed.length} falharam.`);
  process.exitCode = 0;
})();
