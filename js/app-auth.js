(function (global) {
  "use strict";

  let client = null;
  let session = null;
  let config = { enabled: false, provider: "local" };
  const listeners = new Set();
  const CONFIG_KEY = "sc_public_auth_config_v1";

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
      user: user ? {
        id: String(user.id),
        name: String(metadata.full_name || metadata.name || user.email || "Usuário"),
        email: String(user.email || ""),
        avatarUrl: metadata.avatar_url || metadata.picture || null,
        role: "Liderança"
      } : null
    };
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
      else if (forceRefresh) {
        if (global.navigator && global.navigator.onLine === false) throw new Error("Conecte-se à internet para verificar o login.");
        const response = await global.fetch(global.apiConfig.authEndpoint("/config"), { headers: { Accept: "application/json" } });
        if (!response.ok) throw new Error("Configuração de login indisponível.");
        config = await response.json();
        if (config.enabled && global.localStorage) global.localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
      }
      if (!config.enabled) { emit(); return getState(); }
      await loadSdk();
      client = global.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce" } });
      const result = await client.auth.getSession();
      session = result.data && result.data.session || null;
      client.auth.onAuthStateChange((_event, nextSession) => { session = nextSession; emit(); });
      emit();
      return getState();
    } catch (error) {
      config = { enabled: false, provider: "local", error: error.message };
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
