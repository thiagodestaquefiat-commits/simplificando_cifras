// BUG — sincronização assimétrica: celular cria música → aparece no PC;
// PC cria música → NÃO aparece no celular (mesma conta, produção main
// 8560173). Reproduz o fluxo real completo:
//   criar música → songRepository.save() → librarySync.schedule() →
//   debounce → syncNow() (pull + push + pull) → PersonalSong (servidor) →
//   OUTRO dispositivo já aberto (sem reload) → precisa re-puxar sozinho.
//
// Usa js/song-model.js + js/song-repository.js + js/library-sync.js reais
// (vm), e extrai o handler REAL de visibilitychange de index.html (não
// reimplementa a lógica), do mesmo jeito que
// tests/production-stage-navigation-order-repro.test.js já faz para
// refreshStageNavigationOrder().
//
// Roda isolado com:
//   node tests/production-sync-asymmetric-repro.test.js

const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const songModelSource = fs.readFileSync("js/song-model.js", "utf8");
const songRepositorySource = fs.readFileSync("js/song-repository.js", "utf8");
const librarySyncSource = fs.readFileSync("js/library-sync.js", "utf8");
const html = fs.readFileSync("index.html", "utf8");

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

function createDevice(remote) {
  const memory = new Map();
  let online = true, authUser = null, authListener = null;
  const storage = {
    get: (k, f) => (memory.has(k) ? structuredClone(memory.get(k)) : f),
    set: (k, v) => { memory.set(k, structuredClone(v)); return true; }
  };
  const navigator = {};
  Object.defineProperty(navigator, "onLine", { get: () => online });

  async function fetch(url, options = {}) {
    if (!online) throw new Error("offline");
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
    addEventListener: () => {},
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
    login(id) { authUser = id; authListener({ authenticated: true, user: { id } }); },
    // Reproduz exatamente salvar(): songRepository.save() e, só se salvou,
    // librarySync.schedule() — é o único ponto do app real que agenda um
    // push depois de criar/editar uma música.
    createSongAndSchedulePush(newSong) {
      musicas = musicas.concat([newSong]);
      const saved = context.window.songRepository.save(musicas);
      if (saved) context.librarySync.schedule();
    },
    sync: context.librarySync
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 15));
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Extrai o handler REAL de 'visibilitychange' de index.html — o mesmo que
// roda quando o usuário volta pro app sem recarregar a página. Simula
// exatamente essa reentrada, com os mesmos globais que ele usa. Usa
// contagem de chaves (não regex guloso) para achar o fim do corpo da
// função, igual tests/production-stage-navigation-order-repro.test.js faz
// com refreshStageNavigationOrder().
function extractVisibilityChangeBody() {
  const anchor = "document.addEventListener('visibilitychange',()=>{if(document.visibilityState!=='visible'||!currentAuthState.authenticated)return;";
  const start = html.indexOf(anchor);
  assert.ok(start >= 0, "handler de visibilitychange não encontrado em index.html — foi removido/renomeado?");
  const bodyStart = start + anchor.length;
  let depth = 1, end = bodyStart;
  for (let i = bodyStart; i < html.length; i++) {
    if (html[i] === "{") depth++;
    else if (html[i] === "}") { depth--; if (depth === 0) { end = i; break; } }
  }
  return "if(document.visibilityState!=='visible'||!currentAuthState.authenticated)return;" + html.slice(bodyStart, end);
}
const visibilityChangeBody = extractVisibilityChangeBody();

function runVisibilityChangeHandler(device) {
  const sandbox = {
    document: { visibilityState: "visible" },
    currentAuthState: { authenticated: true },
    eventMigrationCandidate: false,
    eventBackgroundSyncReady: false,
    migrateLegacyEventsInBackground: () => {},
    syncEventsNow: () => {},
    librarySync: device.sync
  };
  vm.createContext(sandbox);
  vm.runInContext(`(function(){${visibilityChangeBody}})();`, sandbox);
}

(async () => {
  await record("Celular cria música → aparece no PC (sentido que já funcionava)", async () => {
    const remote = new Map();
    const pc = createDevice(remote);
    const phone = createDevice(remote);
    pc.login("user-sym");
    phone.login("user-sym");
    await settle();

    phone.createSongAndSchedulePush(song("from-phone"));
    await wait(1300); // debounce de schedule() (1200ms) + margem

    runVisibilityChangeHandler(pc);
    await wait(50);

    assert.ok(pc.musicas.some((s) => s.id === "local-from-phone"), "a música criada no celular deveria aparecer no PC depois do foreground");
  });

  await record("PC cria música → aparece no celular já aberto, sem recarregar a página (sentido que estava quebrado)", async () => {
    const remote = new Map();
    const pc = createDevice(remote);
    const phone = createDevice(remote);
    pc.login("user-sym-2");
    phone.login("user-sym-2");
    await settle();

    pc.createSongAndSchedulePush(song("from-pc"));
    await wait(1300);
    assert.ok(remote.get("user-sym-2").size >= 1, "pré-condição: o push do PC precisa ter chegado no servidor");

    // O celular NUNCA relogou nem recarregou — só volta a ficar visível
    // (o usuário troca de app e volta), exatamente como no teste real
    // relatado.
    runVisibilityChangeHandler(phone);
    await wait(50);

    assert.ok(phone.musicas.some((s) => s.id === "local-from-pc"), "a música criada no PC deveria aparecer no celular ao voltar pro app, sem precisar relogar");
  });

  const passed = results.filter((r) => r.status === "PASS").length;
  const failed = results.filter((r) => r.status === "FAIL");
  console.log("\n=== Sincronização assimétrica (PC <-> celular) ===");
  results.forEach((r) => console.log(`[${r.status}] ${r.name}${r.status === "FAIL" ? "\n        -> " + r.reason : ""}`));
  console.log(`\n${passed}/${results.length} passaram, ${failed.length} falharam.`);
  process.exitCode = failed.length > 0 ? 1 : 0;
})();
