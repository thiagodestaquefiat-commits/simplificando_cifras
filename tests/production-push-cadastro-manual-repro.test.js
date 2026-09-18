// BUG — cadastro manual de música no PC não dispara requisição de push
// (confirmado no Chrome DevTools em produção, main 23703d9). A música
// salva normalmente no localStorage/UI, mas nenhum fetch/XHR sai para o
// backend, mesmo depois de 10+ segundos (o debounce de schedule() é de
// só 1.2s).
//
// Reproduz o ponto de entrada REAL da UI: extrai addMusica() e salvar() de
// index.html (não reimplementa) — é exatamente a função por trás do botão
// "Adicionar" no formulário "Nova música" (openAddMusica/addMusica).
//
// Roda isolado com:
//   node tests/production-push-cadastro-manual-repro.test.js

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

// Extrai uma function declaration inteira de index.html por contagem de
// chaves (não regex guloso) — mesmo método já usado por
// production-stage-navigation-order-repro.test.js.
function extractFunction(name) {
  const anchor = `function ${name}(){`;
  const start = html.indexOf(anchor);
  assert.ok(start >= 0, `${name}() não encontrada em index.html — foi removida/renomeada?`);
  let depth = 0, end = start;
  for (let i = html.indexOf("{", start); i < html.length; i++) {
    if (html[i] === "{") depth++;
    else if (html[i] === "}") { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  return html.slice(start, end);
}
const addMusicaSource = extractFunction("addMusica");
const salvarSource = extractFunction("salvar");

function createDevice(remote, { tokenAtSaveTime = "valid-token", consent = true } = {}) {
  const memory = new Map();
  let online = true, authUser = null, authListener = null;
  const storage = {
    get: (k, f) => (memory.has(k) ? structuredClone(memory.get(k)) : f),
    set: (k, v) => { memory.set(k, structuredClone(v)); return true; }
  };
  const navigator = {};
  Object.defineProperty(navigator, "onLine", { get: () => online });
  const fetchLog = [];

  async function fetch(url, options = {}) {
    fetchLog.push({ url, options });
    if (!online) throw new Error("offline");
    const owner = String(options.headers.Authorization).slice(7);
    const method = options.method || "GET";
    const values = remote.get(owner) || new Map();
    remote.set(owner, values);
    if (method === "GET") return response({ songs: [...values.values()] });
    const body = JSON.parse(options.body);
    const results2 = [];
    body.items.forEach((item) => {
      const value = { id: `server-${owner}-${values.size}`, clientId: item.clientId, songData: structuredClone(item.songData), version: 1, updatedAt: new Date().toISOString(), deletedAt: null };
      values.set(item.clientId, value);
      results2.push({ clientId: item.clientId, outcome: "created", song: value });
    });
    return response({ results: results2 });
  }

  // token() em library-sync.js chama appAuth.getAccessToken() a cada
  // verificação — aqui simulamos o token que estaria valendo NO MOMENTO
  // exato em que schedule() roda (pode ser diferente do token no login).
  let currentToken = "valid-token";
  const context = {
    window: null, console, structuredClone, setTimeout, clearTimeout, crypto: global.crypto, fetch, navigator,
    storage, apiConfig: { libraryEndpoint: (p) => "https://api.test/songs" + p },
    addEventListener: () => {},
    appAuth: { getAccessToken: () => currentToken, subscribe: (fn) => { authListener = fn; fn({ authenticated: Boolean(authUser), user: authUser ? { id: authUser } : null }); } }
  };
  context.window = context;
  vm.runInNewContext(songModelSource, context);
  vm.runInNewContext(songRepositorySource, context);
  vm.runInNewContext(librarySyncSource, context);

  const catalogoPadrao = [];
  const initialMusicas = context.window.songRepository.load(catalogoPadrao);

  // Formulário "Nova música": só os campos que addMusica() lê. `sandbox`
  // (não uma variável externa) é a ÚNICA fonte de verdade de `musicas` —
  // addMusica()/salvar() reais rodam DENTRO deste contexto e reatribuem
  // sandbox.musicas diretamente; por isso as closures de
  // librarySync.initialize() abaixo também leem/escrevem sandbox.musicas,
  // em vez de uma variável separada (senão schedule()/syncNow() enxergariam
  // uma biblioteca desatualizada, sem a música recém-criada).
  const formFields = { "fm-title": "", "fm-artist": "", "fm-key": "", "fm-capo": "", "fm-blocos": "" };
  const sandbox = {
    document: { getElementById: (id) => (id in formFields ? { value: formFields[id] } : { value: "" }) },
    musicas: initialMusicas, songRepository: context.window.songRepository, eventRepository: { save: () => true },
    setlists: [], librarySync: context.librarySync,
    parseBlocks: () => [{ l: "Refrão", c: "C  G" }],
    closeModal: () => {}, renderMusicas: () => { }, showToast: () => {}
  };

  context.librarySync.initialize({
    getSongs: () => sandbox.musicas, setSongs: (v) => { sandbox.musicas = v; },
    persist: (v) => { sandbox.musicas = v; context.window.songRepository.save(v); }, render() {},
    activateOwner: (userId) => context.window.songRepository.activateOwner(userId, sandbox.musicas, catalogoPadrao),
    deactivateOwner: () => context.window.songRepository.deactivateOwner(catalogoPadrao),
    confirmOwner: (v) => context.window.songRepository.confirmActiveOwner(v),
    markDeleted: (v, c) => context.window.songRepository.markDeleted(v, c),
    confirmDeleted: (v) => context.window.songRepository.confirmDeleted(v),
    getDeletedClientIds: () => context.window.songRepository.getDeletedClientIds(),
    getPendingDeletedClientIds: () => context.window.songRepository.getPendingDeletedClientIds()
  });

  // Login "normal" (estabelece consentimento, como um dispositivo já usado
  // antes) — depois, ajustamos o token pro valor pedido para o momento do
  // cadastro manual, simulando uma sessão que expira/renova silenciosamente
  // SEM disparar um novo evento de login (mesmo userId).
  authUser = "user-manual";
  authListener({ authenticated: true, user: { id: authUser } });

  vm.createContext(sandbox);
  vm.runInContext(`${salvarSource}\n${addMusicaSource}`, sandbox);

  return {
    get musicas() { return sandbox.musicas; },
    setForm(values) { Object.assign(formFields, values); },
    addMusica: () => sandbox.addMusica(),
    setTokenAtSaveTime(value) { currentToken = value; },
    // Simula um evento de auth state para o MESMO usuário (ex.: Supabase
    // renovando o token em segundo plano e disparando onAuthStateChange
    // com TOKEN_REFRESHED) — sem trocar de userId, então não é um "novo
    // login".
    reemitSameUserAuth() { authListener({ authenticated: true, user: { id: authUser } }); },
    sync: context.librarySync,
    fetchLog,
    remote
  };
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const settle = () => new Promise((resolve) => setTimeout(resolve, 15));

(async () => {
  await record("Caminho feliz: token válido no momento do cadastro → addMusica() dispara fetch (prova que a wiring addMusica→salvar→schedule está correta)", async () => {
    const remote = new Map();
    const device = createDevice(remote);
    await settle(); // deixa o pull() disparado pelo login (autenticação inicial) terminar antes do teste
    device.setForm({ "fm-title": "TESTE SYNC PC", "fm-artist": "Teste" });
    device.setTokenAtSaveTime("valid-token");
    device.addMusica();
    await wait(1300); // debounce de schedule() (1200ms) + margem

    assert.ok(device.musicas.some((s) => s.title === "TESTE SYNC PC"), "pré-condição: a música precisa estar na biblioteca local");
    assert.ok(device.fetchLog.length > 0, "com token válido, addMusica() deveria ter disparado ao menos 1 fetch para o backend");
    assert.ok([...remote.values()].some((owner) => owner.size > 0), "o servidor deveria ter recebido a música");
  });

  await record("REPRODUÇÃO: token indisponível no exato momento do save → addMusica() salva local mas NÃO dispara fetch, e fica preso mesmo depois do token voltar", async () => {
    const remote = new Map();
    const device = createDevice(remote);
    await settle();
    device.setForm({ "fm-title": "TESTE SYNC PC", "fm-artist": "Teste" });

    // Simula exatamente o que a evidência de produção sugere: no instante
    // em que addMusica()->salvar()->schedule() roda, appAuth.getAccessToken()
    // não devolve um token utilizável (sessão expirando/renovando).
    device.setTokenAtSaveTime(null);
    const baseline = device.fetchLog.length; // ignora o pull() do login inicial (já resolvido no settle() acima)
    device.addMusica();
    await wait(1300);

    assert.ok(device.musicas.some((s) => s.title === "TESTE SYNC PC"), "a música fica salva localmente (é isso que o usuário vê na tela)");
    assert.equal(device.fetchLog.length - baseline, 0, "com token indisponível no momento do save, nenhum fetch novo deveria ter sido tentado — reproduz exatamente 'nenhuma requisição em 10s'");
    assert.equal(device.sync.getStatus().phase, "unauthenticated", "o status interno registra a causa (token ausente), mas nada reagenda sozinho");

    // O token "volta" (renovação silenciosa em segundo plano — Supabase
    // dispara onAuthStateChange com TOKEN_REFRESHED, MESMO userId, o que
    // chega em library-sync.js pelo mesmo appAuth.subscribe). CORRIGIDO:
    // esse re-emissão para o mesmo usuário agora verifica se há conteúdo
    // pendente e reagenda o push sozinha.
    device.setTokenAtSaveTime("valid-token-recovered");
    device.reemitSameUserAuth();
    await wait(1300);
    assert.ok(device.fetchLog.length - baseline > 0, "quando o token volta a ficar válido, a próxima renovação de sessão (mesmo usuário) deveria reagendar o push sozinha, sem precisar de uma nova ação do usuário ou logout/login");
    assert.ok([...remote.values()].some((owner) => owner.size > 0), "a música presa deveria ter chegado ao servidor depois da sessão se recuperar");
  });

  const passed = results.filter((r) => r.status === "PASS").length;
  const failed = results.filter((r) => r.status === "FAIL");
  console.log("\n=== Push do cadastro manual não dispara (PC) ===");
  results.forEach((r) => console.log(`[${r.status}] ${r.name}${r.status === "FAIL" ? "\n        -> " + r.reason : ""}`));
  console.log(`\n${passed}/${results.length} passaram, ${failed.length} falharam.`);
  process.exitCode = failed.length > 0 ? 1 : 0;
})();
