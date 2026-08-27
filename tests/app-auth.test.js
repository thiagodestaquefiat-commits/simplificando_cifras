const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const window = {
  apiConfig: { authEndpoint: (path) => "http://api.test/api/auth" + path },
  fetch: async () => ({ ok: true, json: async () => ({ enabled: false, provider: "local", supabaseUrl: "", supabaseAnonKey: "" }) }),
  location: { href: "http://127.0.0.1:4173/" }
};
const context = vm.createContext({ window, URL, Promise, Error, Set, document: { createElement() {}, head: { appendChild() {} } } });
vm.runInContext(fs.readFileSync(path.resolve(__dirname, "..", "js/app-auth.js"), "utf8"), context, { filename: "app-auth.js" });

(async () => {
  const state = await window.appAuth.initialize();
  assert.equal(state.enabled, false);
  assert.equal(state.authenticated, false);
  assert.equal(window.appAuth.getAccessToken(), null);
  await assert.rejects(() => window.appAuth.signInWithGoogle(), /não foi configurado/);
  console.log("app-auth.test.js: OK");
})().catch((error) => { console.error(error); process.exitCode = 1; });
