// Página inicial: com a sessão salva da mesma conta, as playlists guardadas aparecem antes
// do login confirmar pela internet; de outra conta, ou depois de sair, não aparecem.
const assert = require("node:assert/strict");
const fs = require("node:fs");

const html = fs.readFileSync("index.html", "utf8");
assert.match(html, /showCachedAccountPlaylists\(\);\nappAuth\.initialize\(\)/, "mostra as playlists guardadas antes de esperar o login");
assert.match(html, /rememberCachedAccountOwner\(state\.user\.id,appCurrentUser\.id\);homePlaylists\.setProvisionalOwner\(null\)/, "ao confirmar a conta, lembra e usa a conta real");
assert.match(html, /if\(!savedLoginUserId\(\)\)\{forgetCachedAccountOwner\(\);homePlaylists\.setProvisionalOwner\(null\);\}/, "ao sair (sessão apagada), esquece a conta; falha de rede não");
assert.match(html, /cachedAccountOwner\(\)\?\.authUserId!==String\(state\.user\.id\)\)homePlaylists\.setProvisionalOwner\(null\)/, "conta diferente: não mostra as playlists da outra");
assert.match(html, /cached\.authUserId===loginUser/, "só usa a lembrança se a sessão salva for da mesma conta");

const source = fs.readFileSync("js/home-playlists.js", "utf8");
assert.match(source, /const owner = \(\) => provisionalOwner \|\| /, "a conta provisória vale só para a página inicial de playlists");

// Funções auxiliares, executadas de verdade.
const start = html.indexOf("const CACHED_ACCOUNT_OWNER_KEY");
const end = html.indexOf("showCachedAccountPlaylists();\nappAuth.initialize()");
const helpers = html.slice(start, end);
function run(storage, authenticated = false) {
  const calls = [];
  const localStorage = {
    data: { ...storage },
    getItem(key) { return Object.hasOwn(this.data, key) ? this.data[key] : null; },
    setItem(key, value) { this.data[key] = String(value); },
    removeItem(key) { delete this.data[key]; }
  };
  const proxy = new Proxy(localStorage, { ownKeys: (target) => Object.keys(target.data), getOwnPropertyDescriptor: (target, key) => Object.hasOwn(target.data, key) ? { enumerable: true, configurable: true, value: target.data[key] } : undefined });
  const scope = new Function("localStorage", "currentAuthState", "homePlaylists", helpers + "return {showCachedAccountPlaylists,rememberCachedAccountOwner,forgetCachedAccountOwner};");
  const api = scope(proxy, { authenticated }, { setProvisionalOwner: (value) => calls.push(value) });
  return { api, calls, localStorage };
}
const session = (id) => JSON.stringify({ access_token: "x", user: { id } });

{ // mesma conta: mostra
  const { api, calls } = run({ "sb-abc-auth-token": session("auth-1"), roudy_cached_account_owner: JSON.stringify({ authUserId: "auth-1", ownerId: "owner-1" }) });
  api.showCachedAccountPlaylists();
  assert.deepEqual(calls, ["owner-1"]);
}
{ // outra conta na sessão: não mostra
  const { api, calls } = run({ "sb-abc-auth-token": session("auth-2"), roudy_cached_account_owner: JSON.stringify({ authUserId: "auth-1", ownerId: "owner-1" }) });
  api.showCachedAccountPlaylists();
  assert.deepEqual(calls, []);
}
{ // sem sessão salva (saiu da conta): não mostra
  const { api, calls } = run({ roudy_cached_account_owner: JSON.stringify({ authUserId: "auth-1", ownerId: "owner-1" }) });
  api.showCachedAccountPlaylists();
  assert.deepEqual(calls, []);
}
{ // lembrar e esquecer
  const { api, localStorage } = run({});
  api.rememberCachedAccountOwner("auth-9", "owner-9");
  assert.deepEqual(JSON.parse(localStorage.data.roudy_cached_account_owner), { authUserId: "auth-9", ownerId: "owner-9" });
  api.forgetCachedAccountOwner();
  assert.equal(localStorage.data.roudy_cached_account_owner, undefined);
}
console.log("home-cached-account-playlists.test.js: OK");
