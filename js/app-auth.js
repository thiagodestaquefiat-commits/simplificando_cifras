(function (global) {
  "use strict";

  let client = null;
  let session = null;
  let initializationPromise = null;
  let callbackExchangeAttempted = false;
  let config = { enabled: false, provider: "local" };
  const listeners = new Set();
  const CONFIG_KEY = "sc_public_auth_config_v1";

  function safeError(error) {
    if (!error) return null;
    const message = String(error.message || error)
      .replace(/([?&](?:code|token|key)=)[^&\s]+/gi, "$1[redacted]")
      .replace(/[A-Za-z0-9_-]{32,}/g, "[redacted]");
    return {
      name: String(error.name || "Error"),
      message,
      code: error.code == null ? null : String(error.code),
      status: error.status == null ? null : Number(error.status)
    };
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

  async function initializeOnce(forceRefresh, initialCallbackCode) {
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
      const code = initialCallbackCode;
      if (!client) {
        client = global.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, flowType: "pkce" } });
        client.auth.onAuthStateChange((_event, nextSession) => {
          session = nextSession;
          emit();
        });
      }
      const result = await client.auth.getSession();
      if (result.error) throw result.error;
      session = result.data && result.data.session || null;
      if (code && !session && !callbackExchangeAttempted) {
        callbackExchangeAttempted = true;
        const exchange = await client.auth.exchangeCodeForSession(code);
        if (exchange.error) throw exchange.error;
        session = exchange.data && exchange.data.session || null;
      }
      if (code && session) cleanCallbackUrl();
      emit();
      return getState();
    } catch (error) {
      if (global.console && typeof global.console.error === "function") global.console.error("[app-auth] authentication failed", JSON.stringify(safeError(error)));
      config = { ...config, error: "Não foi possível concluir o login com Google. Tente novamente." };
      emit();
      return getState();
    }
  }

  function initialize(forceRefresh) {
    // O callback precisa ser capturado antes de qualquer await para evitar que
    // outra inicialização ou o carregamento do SDK altere o estado da URL.
    const initialCallbackCode = callbackCode();
    if (initializationPromise) return initializationPromise;
    initializationPromise = initializeOnce(Boolean(forceRefresh), initialCallbackCode)
      .finally(() => { initializationPromise = null; });
    return initializationPromise;
  }

  async function signInWithGoogle() {
    if (!client) throw new Error("O login ainda não foi configurado pela equipe.");
    const redirectTo = `${new URL(global.location.href).origin}/`;
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
