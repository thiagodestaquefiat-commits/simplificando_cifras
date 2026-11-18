// Excluir conta (Play Store): chamada ao servidor, confirmação, limpeza do aparelho e páginas públicas.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "js/app-auth.js"), "utf8");

function harness(serverResponse) {
  const calls = { requests: [], signOut: 0 };
  const user = { id: "user-1", email: "musico@outlook.com", user_metadata: {} };
  let current = { access_token: "access-token", user };
  const auth = {
    async getSession() { return { data: { session: current }, error: null }; },
    onAuthStateChange() { return { data: { subscription: { unsubscribe() {} } } }; },
    async signOut() { calls.signOut += 1; current = null; return { error: null }; }
  };
  const window = {
    setTimeout, clearTimeout, navigator: { onLine: true },
    apiConfig: { authEndpoint: (s) => "http://api.test/api/auth" + s, accountEndpoint: () => "http://api.test/api/account" },
    fetch: async (url, options) => {
      if (url.endsWith("/config")) return { ok: true, json: async () => ({ enabled: true, provider: "supabase", supabaseUrl: "https://supabase.test", supabaseAnonKey: "anon" }) };
      calls.requests.push({ url, options });
      return serverResponse;
    },
    location: { href: "https://roudy.test/" }, history: { replaceState() {} },
    localStorage: { getItem: () => null, setItem() {}, key: () => null, get length() { return 0; } },
    console: { info() {}, error() {} },
    supabase: { createClient() { return { auth }; } }
  };
  vm.runInContext(source, vm.createContext({ window, URL, Promise, Error, Set, JSON, document: { createElement() {}, head: { appendChild() {} } } }));
  return { window, calls };
}

(async () => {
  const ok = harness({ ok: true, json: async () => ({ deleted: true, loginRemoved: true }) });
  await ok.window.appAuth.initialize();
  assert.equal(ok.window.appAuth.getState().authenticated, true);
  const result = await ok.window.appAuth.deleteAccount("EXCLUIR");
  assert.equal(result.deleted, true);
  const request = ok.calls.requests[0];
  assert.equal(request.url, "http://api.test/api/account");
  assert.equal(request.options.method, "DELETE");
  assert.equal(request.options.headers.Authorization, "Bearer access-token");
  assert.equal(JSON.parse(request.options.body).confirm, "EXCLUIR");
  assert.equal(ok.calls.signOut, 1, "encerra a sessão local depois de excluir");
  assert.equal(ok.window.appAuth.getState().authenticated, false);

  const fail = harness({ ok: false, json: async () => ({ erro: { mensagem: "Digite EXCLUIR para confirmar a exclusão da conta." } }) });
  await fail.window.appAuth.initialize();
  await assert.rejects(fail.window.appAuth.deleteAccount("sim"), /Digite EXCLUIR/);
  assert.equal(fail.calls.signOut, 0, "se o servidor recusar, continua conectado");
  assert.equal(fail.window.appAuth.getState().authenticated, true);

  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.match(html, /function openDeleteAccount\(\)/);
  assert.match(html, /typed!=='EXCLUIR'/, "só exclui com EXCLUIR digitado");
  assert.match(html, /Excluir minha conta/);
  assert.match(html, /function purgeAccountFromDevice\(authUserId,owners\)/);
  const logout = html.slice(html.indexOf("async function logoutAppAccount"), html.indexOf("async function openBandManager"));
  assert.match(logout, /purgeAccountFromDevice\(authUserId,owners\)/, "Sair continua limpando o aparelho");
  assert.match(html, /href="termos\.html"/);
  assert.match(html, /href="privacidade\.html"/);

  for (const page of ["termos.html", "privacidade.html", "excluir-conta.html"]) {
    const text = fs.readFileSync(path.join(root, page), "utf8");
    assert.match(text, /roudy\.oficial@gmail\.com/, page + " tem o contato");
    assert.match(text, /<meta name="viewport"/, page + " funciona no celular");
  }
  assert.match(fs.readFileSync(path.join(root, "termos.html"), "utf8"), /Remoção de conteúdo/);
  assert.match(fs.readFileSync(path.join(root, "excluir-conta.html"), "utf8"), /EXCLUIR/);

  const sw = fs.readFileSync(path.join(root, "service-worker.js"), "utf8");
  assert.match(sw, /const appShell = /, "só a página do app vira a cópia offline");
  console.log("account-deletion.test.js: OK (exclusão, confirmação, limpeza, páginas e service worker)");
})().catch((error) => { console.error(error); process.exit(1); });
