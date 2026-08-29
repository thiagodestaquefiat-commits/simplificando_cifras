(function (global) {
  "use strict";

  let client = null;
  let session = null;
  let config = { enabled: false, provider: "local" };
  const listeners = new Set();
  const CONFIG_KEY = "sc_public_auth_config_v1";
  const DIAGNOSTIC_PREFIX = "[app-auth:pkce]";

  function safeError(error) {
    if (!error) return null;
    const message = String(error.message || error).replace(/([?&](?:code|token|key)=)[^&\s]+/gi, "$1[redacted]");
    return {
      name: String(error.name || "Error"),
      message,
      code: error.code == null ? null : String(error.code),
      status: error.status == null ? null : Number(error.status)
    };
  }

  function authStorageState() {
    const result = { hasCodeVerifier: false, hasStoredSession: false };
    try {
      const storage = global.localStorage;
      if (!storage || typeof storage.key !== "function") return result;
      for (let index = 0; index < storage.length; index += 1) {
        const key = String(storage.key(index) || "");
        if (!/^sb-.+-auth-token/i.test(key)) continue;
        if (/-code-verifier$/i.test(key)) result.hasCodeVerifier = Boolean(storage.getItem(key));
        else result.hasStoredSession = Boolean(storage.getItem(key));
      }
    } catch (_error) {}
    return result;
  }

  function diagnostic(step, details) {
    if (!global.console || typeof global.console.info !== "function") return;
    global.console.info(DIAGNOSTIC_PREFIX, step, JSON.stringify(details));
  }

  function emit() {
    const state = getState();
    listeners.forEach((listener) => { try { listener(state); } catch (_error) {} });
  }

  function getState() {
    const user = session && session.user;
    const metadata = user && user.user_metadata || {};
    return {
      enabled: Boolean(config.enabled),
      authenticated: Boolean(user),
      error: config.error || null,
      user: user ? {
        id: String(user.id),
        name: String(metadata.full_name || metadata.name || user.email || "Usuário"),
        email: String(user.email || ""),
        avatarUrl: metadata.avatar_url || metadata.picture || null,
        role: "Liderança"
      } : null
    };
  }

  function callbackCode() {
    try { return new URL(global.location.href).searchParams.get("code"); }
    catch (_error) { return null; }
  }

  function cleanCallbackUrl() {
    if (!global.history || typeof global.history.replaceState !== "function") return;
    const url = new URL(global.location.href);
    ["code", "error", "error_code", "error_description"].forEach((name) => url.searchParams.delete(name));
    global.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }

  function loadSdk() {
    if (global.supabase && global.supabase.createClient) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js";
      script.async = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error("Não foi possível carregar o serviço de login."));
      document.head.appendChild(script);
    });
  }

  async function initialize(forceRefresh) {
    try {
      const cached = global.localStorage && JSON.parse(global.localStorage.getItem(CONFIG_KEY) || "null");
      if (!forceRefresh && cached && cached.enabled) config = cached;
      else {
        if (global.navigator && global.navigator.onLine === false) throw new Error("Conecte-se à internet para verificar o login.");
        const response = await global.fetch(global.apiConfig.authEndpoint("/config"), { headers: { Accept: "application/json" } });
        if (!response.ok) throw new Error("Configuração de login indisponível.");
        config = await response.json();
        if (config.enabled && global.localStorage) global.localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
      }
      if (!config.enabled) { emit(); return getState(); }
      await loadSdk();
      const code = callbackCode();
      client = global.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, flowType: "pkce" } });
      let authEventBeforeManualExchange = false;
      diagnostic("client-created", { hasCallbackCode: Boolean(code), ...authStorageState() });
      client.auth.onAuthStateChange((event, nextSession) => {
        if (code && !session) authEventBeforeManualExchange = true;
        session = nextSession;
        diagnostic("auth-state-change", { event: String(event || "unknown"), hasSession: Boolean(nextSession), ...authStorageState() });
        emit();
      });
      const result = await client.auth.getSession();
      diagnostic("get-session", { hasSession: Boolean(result.data && result.data.session), error: safeError(result.error), authEventBeforeManualExchange, ...authStorageState() });
      if (result.error) throw result.error;
      session = result.data && result.data.session || null;
      if (code && !session) {
        diagnostic("manual-exchange-start", { authEventBeforeManualExchange, ...authStorageState() });
        const exchange = await client.auth.exchangeCodeForSession(code);
        diagnostic("manual-exchange-result", { hasSession: Boolean(exchange.data && exchange.data.session), error: safeError(exchange.error), ...authStorageState() });
        if (exchange.error) throw exchange.error;
        session = exchange.data && exchange.data.session || null;
      }
      if (code && session) cleanCallbackUrl();
      emit();
      return getState();
    } catch (error) {
      config = { ...config, error: "Não foi possível concluir o login com Google. Tente novamente." };
      emit();
      return getState();
    }
  }

  async function signInWithGoogle() {
    if (!client) throw new Error("O login ainda não foi configurado pela equipe.");
    const redirectTo = new URL("./", global.location.href).href.split("?")[0].split("#")[0];
    const result = await client.auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
    if (result.error) throw result.error;
  }

  async function signOut() {
    if (!client) return;
    const result = await client.auth.signOut();
    if (result.error) throw result.error;
    session = null;
    emit();
  }

  function subscribe(listener) { listeners.add(listener); listener(getState()); return () => listeners.delete(listener); }
  function getAccessToken() { return session && session.access_token || null; }
  function refreshConfiguration() { return initialize(true); }

  global.appAuth = Object.freeze({ initialize, refreshConfiguration, signInWithGoogle, signOut, subscribe, getAccessToken, getState });
})(window);
