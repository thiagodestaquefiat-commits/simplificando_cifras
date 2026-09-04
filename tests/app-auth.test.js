const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.resolve(__dirname, "..", "js/app-auth.js"), "utf8");

function createAuthHarness(options = {}) {
  const storage = options.storage || new Map();
  const listeners = [];
  const calls = { exchange: [], oauth: [], authEvents: [], replaceState: [], createOptions: null, createClients: 0, configFetches: 0, getSession: 0, signOut: 0, logs: [] };
  const user = { id: "user-1", email: "musico@example.com", user_metadata: { full_name: "Músico" } };
  const exchangedSession = { access_token: "access-token", user };
  let currentSession = options.initialSession || null;
  const auth = {
    async getSession() { calls.getSession += 1; return { data: { session: currentSession }, error: null }; },
    async exchangeCodeForSession(code) {
      calls.exchange.push(code);
      if (options.exchangeError) return { data: { session: null }, error: new Error("erro técnico do provider") };
      currentSession = exchangedSession;
      calls.authEvents.push("SIGNED_IN");
      listeners.forEach((listener) => listener("SIGNED_IN", currentSession));
      return { data: { session: currentSession }, error: null };
    },
    onAuthStateChange(listener) { listeners.push(listener); return { data: { subscription: { unsubscribe() {} } } }; },
    async signInWithOAuth(payload) { calls.oauth.push(payload); return { error: null }; },
    async signOut() { calls.signOut += 1; currentSession = null; listeners.forEach((listener) => listener("SIGNED_OUT", null)); return { error: null }; }
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
      createClient(_url, _key, createOptions) { calls.createClients += 1; calls.createOptions = createOptions; return { auth }; }
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
  assert.deepEqual(callback.calls.authEvents, ["SIGNED_IN"], "a troca PKCE deve produzir o evento SIGNED_IN");
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

  const concurrent = createAuthHarness({ href: "https://deploy-preview-29--simplificandocifras.netlify.app/?code=one-exchange" });
  const [concurrentA, concurrentB] = await Promise.all([
    concurrent.window.appAuth.initialize(),
    concurrent.window.appAuth.initialize()
  ]);
  assert.equal(concurrentA.authenticated, true);
  assert.equal(concurrentB.authenticated, true);
  assert.equal(concurrent.calls.createClients, 1, "deve existir uma única instância do cliente Supabase");
  assert.equal(concurrent.listeners.length, 1, "deve existir um único listener de autenticação");
  assert.deepEqual(concurrent.calls.exchange, ["one-exchange"], "o callback PKCE deve ser trocado uma única vez");

  concurrent.listeners[0]("TOKEN_REFRESHED", { access_token: "renewed", user: concurrent.user });
  assert.equal(concurrent.window.appAuth.getAccessToken(), "renewed", "a renovação deve atualizar a sessão em memória");
  await concurrent.window.appAuth.signOut();
  assert.equal(concurrent.calls.signOut, 1);
  assert.equal(concurrent.window.appAuth.getState().authenticated, false, "logout deve remover a sessão");
  await concurrent.window.appAuth.signInWithGoogle();
  assert.equal(concurrent.calls.oauth.length, 1, "um novo login deve poder iniciar após logout");

  await callback.window.appAuth.signInWithGoogle();
  assert.equal(callback.calls.oauth[0].provider, "google");
  assert.equal(callback.calls.oauth[0].options.redirectTo, "https://simplificandocifras.netlify.app/");

  const preview = createAuthHarness({ href: "https://deploy-preview-29--simplificandocifras.netlify.app/music/detail?x=1" });
  await preview.window.appAuth.initialize();
  await preview.window.appAuth.signInWithGoogle();
  assert.equal(preview.calls.oauth[0].options.redirectTo, "https://deploy-preview-29--simplificandocifras.netlify.app/");
  assert.equal(preview.calls.oauth[0].options.scopes, undefined, "não deve solicitar scopes adicionais");

  const reloaded = createAuthHarness({ initialSession: { access_token: "persisted", user: callback.user } });
  const reloadState = await reloaded.window.appAuth.initialize();
  assert.equal(reloadState.authenticated, true, "getSession deve restaurar a sessão persistida após reload/reabertura");
  assert.equal(reloaded.calls.exchange.length, 0);

  console.log("app-auth.test.js: OK (configuração, instância única, PKCE único, persistência, renovação, logout e redirects)");
})().catch((error) => { console.error(error); process.exitCode = 1; });
