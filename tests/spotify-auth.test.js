const assert = require("node:assert/strict");
const { webcrypto } = require("node:crypto");

const session = new Map();
let assignedUrl = null;
let replacedUrl = null;
let tokenRequest = null;

global.window = {
  location: {
    protocol: "http:",
    href: "http://127.0.0.1:4173/",
    search: "",
    assign(url) { assignedUrl = url; }
  },
  history: {
    replaceState(_state, _title, url) { replacedUrl = url; }
  },
  document: { title: "Simplificando Cifras" },
  sessionStorage: {
    getItem(key) { return session.has(key) ? session.get(key) : null; },
    setItem(key, value) { session.set(key, value); },
    removeItem(key) { session.delete(key); }
  },
  crypto: webcrypto,
  btoa(value) { return Buffer.from(value, "binary").toString("base64"); },
  async fetch(url, options) {
    tokenRequest = { url, options };
    return {
      ok: true,
      async json() {
        return {
          access_token: "access-1",
          refresh_token: "refresh-1",
          expires_in: 3600,
          scope: "streaming user-read-private"
        };
      }
    };
  }
};

require("../js/spotify-config.js");
require("../js/spotify-auth.js");

(async () => {
  assert.equal(window.spotifyConfig.clientId, "f3ea3239c97644de99789061ad9a94b6");
  assert.equal(window.spotifyConfig.redirectUri, "http://127.0.0.1:4173/");
  assert.ok(window.spotifyConfig.scopes.includes("streaming"));

  const authorization = await window.spotifyAuth.createAuthorizationRequest();
  const authorizationUrl = new URL(authorization.url);
  assert.equal(authorizationUrl.origin + authorizationUrl.pathname, "https://accounts.spotify.com/authorize");
  assert.equal(authorizationUrl.searchParams.get("client_id"), window.spotifyConfig.clientId);
  assert.equal(authorizationUrl.searchParams.get("code_challenge_method"), "S256");
  assert.equal(authorizationUrl.searchParams.get("redirect_uri"), "http://127.0.0.1:4173/");
  assert.equal(authorizationUrl.searchParams.get("state"), authorization.state);
  assert.ok(authorization.verifier.length >= 43 && authorization.verifier.length <= 128);

  await window.spotifyAuth.startAuthorization();
  assert.ok(assignedUrl.startsWith("https://accounts.spotify.com/authorize?"));

  const pending = JSON.parse(session.get("sc_spotify_auth_v1")).pending;
  window.location.search = `?code=authorization-code&state=${encodeURIComponent(pending.state)}`;
  window.location.href = `http://127.0.0.1:4173/${window.location.search}`;
  const callback = await window.spotifyAuth.handleCallback();

  assert.deepEqual(callback, { handled: true, connected: true });
  assert.equal(tokenRequest.url, "https://accounts.spotify.com/api/token");
  assert.equal(tokenRequest.options.method, "POST");
  assert.equal(tokenRequest.options.body.get("client_id"), window.spotifyConfig.clientId);
  assert.equal(tokenRequest.options.body.get("client_secret"), null);
  assert.equal(tokenRequest.options.body.get("code_verifier"), pending.verifier);
  assert.equal(replacedUrl, "http://127.0.0.1:4173/");
  assert.equal(window.spotifyAuth.isAuthenticated(), true);
  assert.equal(await window.spotifyAuth.getAccessToken(), "access-1");

  window.spotifyAuth.disconnect();
  assert.equal(window.spotifyAuth.isAuthenticated(), false);
  console.log("spotify-auth.test.js: OK");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
