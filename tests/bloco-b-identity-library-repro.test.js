// Testes de VERIFICAÇÃO do Bloco B (identidade, biblioteca pessoal e sincronização).
//
// Nasceu como reprodução (commit 9f60c10, 7/13 PASS) dos bugs encontrados na
// auditoria; depois da correção B1 (ciclo login/logout/ownership) e B2 (capo
// fora do hash de conteúdo musical) os mesmos 13 cenários passam a confirmar
// o comportamento CORRIGIDO, usando o código real de js/song-model.js +
// js/song-repository.js + js/library-sync.js (a mesma composição usada por
// index.html, sem stubs). Cada cenário roda mesmo que um anterior falhe, e o
// resultado (PASS/FAIL/PENDENTE) de cada um é reportado no final.
//
// B3 (originalKey/preferredKey) fica deliberadamente PENDENTE — documentado
// no próprio teste, não é uma falha de execução.
//
// Não está no `npm test` de propósito (é um dossiê de auditoria point-in-time,
// não uma regressão a vigiar a cada build). Rodar isolado com:
//   node tests/bloco-b-identity-library-repro.test.js

const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const songModelSource = fs.readFileSync("js/song-model.js", "utf8");
const songRepositorySource = fs.readFileSync("js/song-repository.js", "utf8");
const librarySyncSource = fs.readFileSync("js/library-sync.js", "utf8");

// vm.runInNewContext roda em um realm separado: arrays/objetos que passam
// por caminhos de código executados dentro do contexto podem ter um
// construtor Array diferente do realm principal do Node, o que faz
// assert.deepEqual falhar mesmo com conteúdo idêntico ("same structure but
// not reference-equal"). plain() normaliza para o realm principal antes de
// comparar estrutura; comparações escalares (.length, .some, propriedade
// direta) não precisam disso.
const plain = (value) => JSON.parse(JSON.stringify(value));

const results = [];
async function record(name, fn) {
  try {
    await fn();
    results.push({ name, status: "PASS" });
  } catch (error) {
    results.push({ name, status: "FAIL", reason: error.message });
  }
}
// Documenta um cenário deliberadamente NÃO implementado nesta etapa (B3:
// originalKey/preferredKey exigiria mudar o formato hasheado de toda música
// existente). Não é uma falha de execução: é uma decisão de escopo.
function recordPending(name, reason) {
  results.push({ name, status: "PENDENTE", reason });
}

function response(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => structuredClone(body) };
}

function song(i, extra = {}) {
  return {
    id: `local-${i}`,
    title: `Música ${i}`,
    artist: "Artista",
    key: "C",
    capo: "",
    blocos: [{ l: "Refrão", c: "C  G" }],
    ...extra
  };
}

// Simula UM dispositivo/aba: mesmo módulo songRepository (mesmas variáveis de
// módulo activeOwnerId/legacyCandidateOwnerId), mesmo storage local, mesmo
// servidor remoto (Map global `remote`, como fariam contas reais na nuvem).
// `login`/`logout` disparam o MESMO listener de appAuth.subscribe que
// js/library-sync.js usa em produção — nenhuma lógica de reset foi
// reimplementada aqui além da que já existe nos módulos reais.
function createDevice(remote, seedStorage = {}) {
  const memory = new Map(Object.entries(seedStorage).map(([k, v]) => [k, structuredClone(v)]));
  let online = true;
  let authUser = null;
  let authListener = null;
  let breakNextFetch = false;
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

  // Fiel a index.html linha ~2478: nenhuma lógica extra além da wiring real.
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
    // Grava diretamente pelo repositório real (como fariam saveMusica/editMusica
    // em index.html), SEM passar por librarySync — é o que acontece quando o
    // usuário edita uma música localmente fora de um syncNow().
    saveViaRepository(v) { const ok = context.window.songRepository.save(v); musicas = v; return ok; },
    login(id) { authUser = id; authListener({ authenticated: true, user: { id } }); },
    logout() { authUser = null; authListener({ authenticated: false, user: null }); },
    setOnline(v) { online = v; networkListeners[v ? "online" : "offline"]?.(); },
    breakNextFetch() { breakNextFetch = true; },
    storage,
    sync: context.librarySync,
    repository: context.window.songRepository
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 15));

(async () => {
  // ---------------------------------------------------------------- 1 e 2
  // Login da conta A, depois logout da conta A no mesmo dispositivo.
  const remoteAB = new Map();
  const dev = createDevice(remoteAB);

  await record("1. login da conta A carrega a biblioteca da conta", async () => {
    dev.login("user-a");
    await settle();
    assert.equal(dev.sync.getStatus().authenticated, true);
    assert.equal(dev.sync.getStatus().phase, "synced");
    const withSong = dev.musicas.concat([song("a1")]);
    dev.replace(withSong);
    dev.sync.schedule();
    await new Promise((resolve) => setTimeout(resolve, 1300));
    assert.equal(remoteAB.get("user-a").size, 1, "a música de A deveria estar na nuvem de A");
  });

  await record("2. logout da conta A limpa a biblioteca em memória/tela", async () => {
    dev.logout();
    await settle();
    assert.equal(dev.sync.getStatus().authenticated, false, "status de autenticação deveria cair");
    assert.equal(dev.musicas.length, 0, "após logout a tela não deveria continuar mostrando a biblioteca privada de A (ela ainda está em memória: " + dev.musicas.length + " música(s): " + dev.musicas.map((s) => s.id).join(",") + ")");
  });

  await record("5. activeOwnerId não é resetado no logout (vazamento para o cache de A)", async () => {
    // Reproduz exatamente o que a UI faz ao editar uma música "deslogado":
    // chama songRepository.save() diretamente (mesmo caminho de saveMusica()).
    const postLogoutEdit = dev.musicas.concat([song("anon-after-logout")]);
    dev.saveViaRepository(postLogoutEdit);
    const anonymousStorage = dev.storage.get("sc_songs_v1", []);
    assert.ok(
      anonymousStorage.some((s) => s.id === "local-anon-after-logout"),
      "uma edição feita depois do logout deveria ir para o armazenamento local anônimo (sc_songs_v1), " +
      "mas o módulo songRepository ainda tem activeOwnerId apontando para 'user-a' internamente, " +
      "então save() a desviou para o cache privado de A em vez do storage local anônimo"
    );
  });

  await record("3. login da conta B no mesmo dispositivo não herda dados de A", async () => {
    dev.login("user-b");
    await settle();
    assert.equal(dev.sync.getStatus().authenticated, true);
    assert.equal(dev.musicas.length, 0, "B deveria começar com biblioteca vazia (B nunca sincronizou nada), mas recebeu " + dev.musicas.length + " música(s): " + dev.musicas.map((s) => s.id).join(","));
    assert.ok(!dev.musicas.some((s) => s.artist === "Artista" && s.id === "local-a1"), "B não deveria enxergar a música criada por A");
  });

  await record("4. isolamento dos caches de A e B após o ciclo login/logout/login", async () => {
    const caches = dev.storage.get("sc_personal_song_caches_v1", {});
    const cacheA = caches["user-a"] || [];
    const cacheB = caches["user-b"] || [];
    assert.ok(!cacheA.some((s) => s.id === "local-anon-after-logout"), "a edição feita 'deslogado' não deveria estar no cache de A (contaminação de identidade); ela está lá porque activeOwnerId nunca voltou a null no logout");
    assert.equal(cacheB.length, 0, "o cache de B não deveria ter sido tocado por essa transição");
  });

  await record("5b. reabrir a conta A (mesma aba) faz a edição anônima ressurgir na conta de A", async () => {
    dev.logout();
    await settle();
    dev.login("user-a");
    await settle();
    assert.ok(
      !dev.musicas.some((s) => s.id === "local-anon-after-logout"),
      "a música criada enquanto a tela achava que estava deslogada reaparece na biblioteca de A ao relogar, " +
      "porque ela foi silenciosamente gravada no cache de A pelo bug do item 5"
    );
  });

  // ---------------------------------------------------------------- 6 e 7
  await record("6. biblioteca local existente antes do primeiro login com Google é preservada como candidata", async () => {
    const remote6 = new Map();
    const preExisting = [song("pre1"), song("pre2"), song("pre3")];
    const boot = createDevice(remote6, { sc_songs_v1: preExisting, cifras_musicas_v1: preExisting });
    assert.equal(boot.musicas.map((s) => s.id).join(","), preExisting.map((s) => s.id).join(","), "a biblioteca local deveria estar carregada em memória antes de qualquer login");
    boot.login("first-google-login");
    await settle();
    assert.equal(boot.musicas.length, 3, "a biblioteca local não deveria desaparecer no primeiro login");
  });

  await record("7. primeiro login sincroniza sem apagar a biblioteca local (migração silenciosa)", async () => {
    const remote7 = new Map();
    const preExisting = [song("keep1"), song("keep2")];
    const boot = createDevice(remote7, { sc_songs_v1: preExisting, cifras_musicas_v1: preExisting });
    boot.login("first-login-user");
    await settle();
    assert.equal(remote7.get("first-login-user")?.size, 2, "as músicas locais deveriam ter sido copiadas para a nuvem da conta");
    assert.equal(boot.musicas.map((s) => s.id).sort().join(","), ["local-keep1", "local-keep2"].join(","), "a biblioteca local continua visível depois da migração silenciosa");
  });

  // ---------------------------------------------------------------- 8
  await record("8. falha de pull (rede/servidor, online) não substitui a biblioteca visível por uma lista vazia", async () => {
    const remote8 = new Map();
    const existing = [song("keep-on-fail")];
    const boot = createDevice(remote8, { sc_songs_v1: existing, cifras_musicas_v1: existing });
    boot.login("pull-fail-user");
    await settle();
    assert.ok(boot.musicas.length > 0, "pré-condição: deveria haver músicas antes de forçar a falha");
    boot.breakNextFetch();
    await assert.rejects(() => boot.sync.pull(), /falha_de_rede_simulada/, "pull deveria propagar o erro de rede/servidor (não engolir silenciosamente)");
    assert.ok(boot.musicas.length > 0, "depois de uma falha de pull a tela não deveria ficar com biblioteca vazia (tem " + boot.musicas.length + ")");
    assert.equal(boot.sync.getStatus().phase, "error", "o status deveria refletir o erro, não 'synced' silencioso");
  });

  // ---------------------------------------------------------------- 9
  await record("9. mesma conta em dois dispositivos converge para a mesma biblioteca", async () => {
    const remote9 = new Map();
    const deviceOne = createDevice(remote9);
    deviceOne.login("two-devices-user");
    await settle();
    deviceOne.replace(deviceOne.musicas.concat([song("from-pc")]));
    await deviceOne.sync.syncNow();

    const deviceTwo = createDevice(remote9);
    deviceTwo.login("two-devices-user");
    await settle();
    assert.equal(deviceTwo.musicas.length, 1, "o segundo dispositivo deveria baixar a música criada no primeiro");
    assert.equal(deviceTwo.musicas[0].id, "local-from-pc");
  });

  // ---------------------------------------------------------------- 10
  await record("10. clientId é preservado ao editar apenas o capotraste (caminho real de update())", async () => {
    const remote10 = new Map();
    const boot = createDevice(remote10);
    boot.login("client-id-user");
    await settle();
    boot.replace(boot.musicas.concat([song("preserve-id")]));
    await boot.sync.syncNow();
    const clientIdBefore = boot.musicas.find((s) => s.id === "local-preserve-id").librarySync.clientId;
    assert.ok(clientIdBefore, "pré-condição: a música precisa ter clientId depois do primeiro syncNow()");

    const updated = boot.repository.update(boot.musicas, "local-preserve-id", { capo: "Capotraste casa 3" });
    boot.replace(updated.songs);
    const clientIdAfter = boot.musicas.find((s) => s.id === "local-preserve-id").librarySync.clientId;
    assert.equal(clientIdAfter, clientIdBefore, "o clientId não deveria mudar apenas por editar o capotraste");
  });

  // ---------------------------------------------------------------- 11
  await record("11. alterar somente o capo não deveria alterar o hash/conteúdo musical", async () => {
    const remote11 = new Map();
    const boot = createDevice(remote11);
    const base = song("capo-hash", { capo: "" });
    const withCapo = song("capo-hash", { capo: "Capotraste casa 2" });
    const hashWithoutCapo = boot.sync.contentHash(base);
    const hashWithCapo = boot.sync.contentHash(withCapo);
    assert.equal(hashWithCapo, hashWithoutCapo, "o capo é personalização do usuário; não deveria mudar o hash de conteúdo musical (título/artista/tom/blocos)");
    assert.equal(boot.sync.sameContent(base, withCapo), true, "sameContent deveria considerar 'mesmo conteúdo musical' quando só o capo muda");
  });

  // -------------------------------------------------- arquitetura (gap docs)
  // B3: implementar preferredKey distinto de originalKey mudaria o shape
  // normalizado de TODA música (songModel.create), o que muda o resultado de
  // musicalPayload()/contentHash() para as músicas já sincronizadas — o
  // mesmo tipo de mudança estrutural que a Etapa B3 pediu para NÃO fazer
  // sem necessidade comprovada. Decisão: não implementar agora; documentar
  // como próximo passo (ver IMPLEMENTACAO_BLOCO_B_ROUDY.md).
  recordPending(
    "originalKey e preferredKey ainda não são conceitos distintos no song-model",
    "adicionar preferredKey ao shape normalizado de songModel.create() mudaria o contentHash de todas as músicas já sincronizadas (496/498 na nuvem); isso equivale à mudança estrutural que a Etapa B3 pediu para evitar sem schema/migration dedicados. Não implementado nesta etapa."
  );

  // ------------------------------------------------------------------ saída
  const passed = results.filter((r) => r.status === "PASS").length;
  const failed = results.filter((r) => r.status === "FAIL");
  const pending = results.filter((r) => r.status === "PENDENTE");
  console.log("\n=== TESTES_REPRODUCAO_BLOCO_B_ROUDY ===");
  results.forEach((r) => {
    console.log(`[${r.status}] ${r.name}${r.status !== "PASS" ? "\n        -> " + r.reason : ""}`);
  });
  console.log(`\n${passed}/${results.length - pending.length} cenários corrigíveis PASS, ${failed.length} FAIL, ${pending.length} PENDENTE (documentado).`);
  process.exitCode = failed.length > 0 ? 1 : 0;
})();
