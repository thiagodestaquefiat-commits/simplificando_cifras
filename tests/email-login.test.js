// Login por e-mail com código de 6 dígitos (Supabase OTP): envio, validação, confirmação e erros.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.resolve(__dirname, "..", "js/app-auth.js"), "utf8");

function harness(options = {}) {
  const calls = { otp: [], verify: [] };
  const listeners = [];
  const user = { id: "email-user-1", email: "musico@outlook.com", user_metadata: {} };
  const auth = {
    async getSession() { return { data: { session: null }, error: null }; },
    onAuthStateChange(listener) { listeners.push(listener); return { data: { subscription: { unsubscribe() {} } } }; },
    async signInWithOtp(payload) { calls.otp.push(payload); return { error: options.otpError || null }; },
    async verifyOtp(payload) {
      calls.verify.push(payload);
      if (payload.token !== "123456") return { data: { session: null }, error: { message: "Token has expired or is invalid", status: 403 } };
      return { data: { session: { access_token: "access", user } }, error: null };
    },
    async signOut() { return { error: null }; }
  };
  const storage = new Map();
  const window = {
    setTimeout, clearTimeout,
    apiConfig: { authEndpoint: (suffix) => "http://api.test/api/auth" + suffix },
    fetch: async () => ({ ok: true, json: async () => ({ enabled: true, provider: "supabase", supabaseUrl: "https://supabase.test", supabaseAnonKey: "anon" }) }),
    location: { href: "https://roudy.test/" },
    history: { replaceState() {} },
    navigator: { onLine: true },
    localStorage: { getItem: (k) => storage.get(k) || null, setItem: (k, v) => storage.set(k, v), key: () => null, get length() { return 0; } },
    console: { info() {}, error() {} },
    supabase: { createClient() { return { auth }; } }
  };
  const context = vm.createContext({ window, URL, Promise, Error, Set, document: { createElement() {}, head: { appendChild() {} } } });
  vm.runInContext(source, context, { filename: "app-auth.js" });
  return { window, calls };
}

(async () => {
  const { window, calls } = harness();
  await assert.rejects(window.appAuth.sendEmailCode("x@y.z"), /configurado/, "sem inicializar não envia");
  await window.appAuth.initialize();

  await assert.rejects(window.appAuth.sendEmailCode("sem-arroba"), /e-mail válido/);
  assert.equal(calls.otp.length, 0, "e-mail inválido não chama o Supabase");

  const sent = await window.appAuth.sendEmailCode("  Musico@Outlook.com ");
  assert.equal(sent.email, "musico@outlook.com", "e-mail é normalizado");
  assert.equal(calls.otp[0].email, "musico@outlook.com");
  assert.equal(calls.otp[0].options.shouldCreateUser, true, "primeiro acesso cria a conta");

  await assert.rejects(window.appAuth.verifyEmailCode("musico@outlook.com", "12"), /código/);
  assert.equal(calls.verify.length, 0, "código curto não chama o Supabase");
  await assert.rejects(window.appAuth.verifyEmailCode("musico@outlook.com", "999999"), /inválido ou expirado/);
  assert.equal(window.appAuth.getState().authenticated, false);

  const state = await window.appAuth.verifyEmailCode("musico@outlook.com", "123 456");
  assert.equal(calls.verify.at(-1).token, "123456", "espaços no código são ignorados");
  assert.equal(calls.verify.at(-1).type, "email");
  assert.equal(state.authenticated, true);
  assert.equal(state.user.id, "email-user-1");
  assert.equal(state.user.name, "musico@outlook.com", "sem nome no perfil, usa o e-mail");

  const limited = harness({ otpError: { message: "rate limit", status: 429 } });
  await limited.window.appAuth.initialize();
  await assert.rejects(limited.window.appAuth.sendEmailCode("a@b.com"), /Aguarde um minuto/);

  const html = fs.readFileSync(path.resolve(__dirname, "..", "index.html"), "utf8");
  assert.match(html, /Continuar com e-mail/, "tela inicial oferece e-mail");
  assert.match(html, /function openLoginOptions\(\)/);
  assert.match(html, /autocomplete='one-time-code'/, "celular sugere o código recebido");
  console.log("email-login.test.js: OK (envio, validação, código, limite e tela)");
})().catch((error) => { console.error(error); process.exit(1); });
