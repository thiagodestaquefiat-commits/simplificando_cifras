const assert = require("node:assert/strict");
let lastRequest = null;
global.window = {
  eventCollaboration: { currentAccessToken: () => "token-test" },
  apiConfig: { collaborationEndpoint: (path) => "http://api.test/api/collaboration" + path },
  fetch: async (url, options) => {
    lastRequest = { url, options };
    return { ok: true, status: 200, json: async () => ({ bands: [{ id: "band-1", name: "Equipe" }] }) };
  }
};
require("../js/band-client.js");

(async () => {
  const bands = await window.bandClient.list();
  assert.equal(bands[0].id, "band-1");
  assert.match(lastRequest.url, /collaboration\/bands$/);
  assert.equal(lastRequest.options.headers.Authorization, "Bearer token-test");
  console.log("band-client.test.js: OK");
})().catch((error) => { console.error(error); process.exitCode = 1; });
