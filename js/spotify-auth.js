(function (global) {
  "use strict";

  const AUTHORIZE_URL = "https://accounts.spotify.com/authorize";
  const TOKEN_URL = "https://accounts.spotify.com/api/token";
  const SESSION_KEY = "sc_spotify_auth_v1";
  const EXPIRY_MARGIN_MS = 60000;

  function requireConfig() {
    if (!global.spotifyConfig || !global.spotifyConfig.clientId) {
      throw new Error("Spotify Client ID não configurado.");
    }
  }

  function readSession() {
    try {
      const value = global.sessionStorage.getItem(SESSION_KEY);
      return value ? JSON.parse(value) : {};
    } catch (error) {
      console.warn("Não foi possível ler a sessão do Spotify.", error);
      return {};
    }
  }

  function writeSession(value) {
    try {
      global.sessionStorage.setItem(SESSION_KEY, JSON.stringify(value));
      return true;
    } catch (error) {
      console.error("Não foi possível salvar a sessão do Spotify.", error);
      return false;
    }
  }

  function clearSession() {
    try {
      global.sessionStorage.removeItem(SESSION_KEY);
    } catch (error) {
      console.warn("Não foi possível limpar a sessão do Spotify.", error);
    }
  }

  function randomBase64Url(byteLength) {
    const bytes = new Uint8Array(byteLength);
    global.crypto.getRandomValues(bytes);
    let binary = "";
    bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
    return global.btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  async function createChallenge(verifier) {
    const bytes = new TextEncoder().encode(verifier);
    const digest = await global.crypto.subtle.digest("SHA-256", bytes);
    let binary = "";
    new Uint8Array(digest).forEach((byte) => { binary += String.fromCharCode(byte); });
    return global.btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  async function createAuthorizationRequest() {
    requireConfig();
    const verifier = randomBase64Url(64);
    const state = randomBase64Url(24);
    const challenge = await createChallenge(verifier);
    const session = readSession();
    writeSession({ ...session, pending: { verifier, state, createdAt: Date.now() } });

    const url = new URL(AUTHORIZE_URL);
    url.search = new URLSearchParams({
      response_type: "code",
      client_id: global.spotifyConfig.clientId,
      scope: global.spotifyConfig.scopes.join(" "),
      code_challenge_method: "S256",
      code_challenge: challenge,
      redirect_uri: global.spotifyConfig.redirectUri,
      state
    }).toString();
    return { url: url.toString(), state, verifier };
  }

  async function startAuthorization() {
    const request = await createAuthorizationRequest();
    global.location.assign(request.url);
  }

  async function requestToken(parameters) {
    const response = await global.fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(parameters)
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error_description || payload.error || "Não foi possível autenticar com o Spotify.");
    }
    return payload;
  }

  function storeTokens(payload, previousRefreshToken) {
    const current = readSession();
    const tokens = {
      accessToken: payload.access_token,
      refreshToken: payload.refresh_token || previousRefreshToken || null,
      scope: payload.scope || "",
      expiresAt: Date.now() + Number(payload.expires_in || 3600) * 1000
    };
    writeSession({ ...current, pending: null, tokens });
    return tokens;
  }

  function cleanCallbackUrl() {
    if (!global.history || !global.location) return;
    const url = new URL(global.location.href);
    ["code", "state", "error"].forEach((key) => url.searchParams.delete(key));
    global.history.replaceState({}, global.document ? global.document.title : "", url.toString());
  }

  async function handleCallback() {
    requireConfig();
    const parameters = new URLSearchParams(global.location.search || "");
    const code = parameters.get("code");
    const error = parameters.get("error");
    if (!code && !error) return { handled: false };

    try {
      if (error) throw new Error(error === "access_denied" ? "A conexão com o Spotify foi cancelada." : error);
      const state = parameters.get("state");
      const session = readSession();
      if (!session.pending || !state || state !== session.pending.state) {
        throw new Error("A validação de segurança do Spotify falhou. Tente conectar novamente.");
      }
      if (!session.pending.createdAt || Date.now() - session.pending.createdAt > 10 * 60 * 1000) {
        throw new Error("A tentativa de conexão com o Spotify expirou. Tente novamente.");
      }
      const payload = await requestToken({
        client_id: global.spotifyConfig.clientId,
        grant_type: "authorization_code",
        code,
        redirect_uri: global.spotifyConfig.redirectUri,
        code_verifier: session.pending.verifier
      });
      storeTokens(payload);
      return { handled: true, connected: true };
    } finally {
      cleanCallbackUrl();
    }
  }

  function isAuthenticated() {
    const tokens = readSession().tokens;
    return Boolean(tokens && tokens.accessToken && tokens.refreshToken);
  }

  async function refreshAccessToken() {
    requireConfig();
    const session = readSession();
    if (!session.tokens || !session.tokens.refreshToken) {
      throw new Error("Conecte sua conta Spotify para continuar.");
    }
    const payload = await requestToken({
      client_id: global.spotifyConfig.clientId,
      grant_type: "refresh_token",
      refresh_token: session.tokens.refreshToken
    });
    return storeTokens(payload, session.tokens.refreshToken).accessToken;
  }

  async function getAccessToken() {
    const tokens = readSession().tokens;
    if (!tokens || !tokens.accessToken) throw new Error("Conecte sua conta Spotify para continuar.");
    if (tokens.expiresAt > Date.now() + EXPIRY_MARGIN_MS) return tokens.accessToken;
    return refreshAccessToken();
  }

  function disconnect() {
    clearSession();
  }

  global.spotifyAuth = Object.freeze({
    createAuthorizationRequest,
    startAuthorization,
    handleCallback,
    isAuthenticated,
    getAccessToken,
    refreshAccessToken,
    disconnect
  });
})(window);
