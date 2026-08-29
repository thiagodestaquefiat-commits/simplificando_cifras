const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.resolve(__dirname, "..", "js/app-auth.js"), "utf8");

function createAuthHarness(options = {}) {
  const storage = new Map();
  const listeners = [];
  const calls = { exchange: [], oauth: [], replaceState: [], createOptions: null, configFetches: 0, logs: [] };
  const user = { id: "user-1", email: "musico@example.com", user_metadata: { full_name: "Músico" } };
  const exchangedSession = { access_token: "access-token", user };
  let currentSession = options.initialSession || null;
  const auth = {
    async getSession() { return { data: { session: currentSession }, error: null }; },
    async exchangeCodeForSession(code) {
      calls.exchange.push(code);
      if (options.exchangeError) return { data: { session: null }, error: new Error("erro técnico do provider") };
      currentSession = exchangedSession;
      return { data: { session: currentSession }, error: null };
    },
    onAuthStateChange(listener) { listeners.push(listener); return { data: { subscription: { unsubscribe() {} } } }; },
    async signInWithOAuth(payload) { calls.oauth.push(payload); return { error: null }; },
    async signOut() { currentSession = null; listeners.forEach((listener) => listener("SIGNED_OUT", null)); return { error: null }; }
  };
  const window = {
    apiConfig: { authEndpoint: (suffix) => "http://api.test/api/auth" + suffix },
    fetch: async () => {
      calls.configFetches += 1;
      return { ok: true, json: async () => options.config || { enabled: true, provider: "supabase", supabaseUrl: "https://supabase.test", supabaseAnonKey: "anon-public" } };
    },
    location: { href: options.href || "https://simplificandocifras.netlify.app/" },
    history: { replaceState: (...args) => calls.replaceState.push(args) },
    navigator: { onLine: true },
    localStorage: {
      getItem: (key) => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, value),
      key: (index) => Array.from(storage.keys())[index] || null,
      get length() { return storage.size; }
    },
    console: { info: (...args) => calls.logs.push(args), error: (...args) => calls.logs.push(args) },
    supabase: {
      createClient(_url, _key, createOptions) { calls.createOptions = createOptions; return { auth }; }
    }
  };
  const context = vm.createContext({ window, URL, Promise, Error, Set, document: { title: "Simplificando Cifras", createElement() {}, head: { appendChild() {} } } });
  vm.runInContext(source, context, { filename: "app-auth.js" });
  return { window, calls, listeners, user, exchangedSession };
}

(async () => {
  const disabled = createAuthHarness({ config: { enabled: false, provider: "local", supabaseUrl: "", supabaseAnonKey: "" } });
  const disabledState = await disabled.window.appAuth.initialize();
  assert.equal(disabledState.enabled, false);
  assert.equal(disabledState.authenticated, false);
  assert.equal(disabled.calls.configFetches, 1, "a configuração deve ser consultada no primeiro carregamento");
  await assert.rejects(() => disabled.window.appAuth.signInWithGoogle(), /não foi configurado/);

  const callback = createAuthHarness({ href: "https://simplificandocifras.netlify.app/?code=pkce-code" });
  const states = [];
  callback.window.appAuth.subscribe((state) => states.push(state));
  const callbackState = await callback.window.appAuth.initialize();
  assert.deepEqual(callback.calls.exchange, ["pkce-code"]);
  assert.equal(callbackState.authenticated, true);
  assert.equal(callbackState.user.id, "user-1");
  assert.equal(callback.window.appAuth.getAccessToken(), "access-token");
  assert.equal(callback.calls.replaceState.length, 1);
  assert.equal(callback.calls.replaceState[0][2], "/");
  assert.deepEqual(JSON.parse(JSON.stringify(callback.calls.createOptions)), {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, flowType: "pkce" }
  });
  assert.ok(states.some((state) => state.authenticated), "a interface deve receber o estado autenticado");
  assert.doesNotMatch(JSON.stringify(callback.calls.logs), /access-token|pkce-code|anon-public/, "o diagnóstico não pode registrar tokens, code ou anon key");

  const detected = createAuthHarness({ href: "https://simplificandocifras.netlify.app/?code=already-detected", initialSession: { access_token: "existing", user: callback.user } });
  const detectedState = await detected.window.appAuth.initialize();
  assert.equal(detectedState.authenticated, true);
  assert.equal(detected.calls.exchange.length, 0, "não deve trocar o mesmo code duas vezes quando o SDK já restaurou a sessão");
  assert.equal(detected.calls.replaceState[0][2], "/");

  const failed = createAuthHarness({ href: "https://simplificandocifras.netlify.app/?code=invalid-code", exchangeError: true });
  const failedState = await failed.window.appAuth.initialize();
  assert.equal(failedState.enabled, true, "uma falha de callback não deve desabilitar o login configurado");
  assert.equal(failedState.authenticated, false);
  assert.match(failedState.error, /Não foi possível concluir o login/);
  assert.doesNotMatch(failedState.error, /provider|Supabase|traceback/i);
  assert.equal(failed.calls.replaceState.length, 0, "o code só deve ser removido após uma sessão válida");
  const failedExchangeLog = failed.calls.logs.find((entry) => entry[0] === "[app-auth] authentication failed");
  assert.equal(JSON.parse(failedExchangeLog[1]).message, "erro técnico do provider");

  await callback.window.appAuth.signInWithGoogle();
  assert.equal(callback.calls.oauth[0].provider, "google");
  assert.equal(callback.calls.oauth[0].options.redirectTo, "https://simplificandocifras.netlify.app/");

  console.log("app-auth.test.js: OK (configuração inicial, PKCE, sessão, callback, estado e OAuth Google)");
})().catch((error) => { console.error(error); process.exitCode = 1; });
