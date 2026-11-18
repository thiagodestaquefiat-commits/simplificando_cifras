// Evento aberto: o app confere só a versão e baixa o evento inteiro apenas quando mudou.
const assert = require("node:assert/strict");
const fs = require("node:fs");

const html = fs.readFileSync("index.html", "utf8");
assert.match(html, /setInterval\(refreshOpenEventFromCloud,3000\)/, "o evento aberto confere a cada 3 s");
assert.match(html, /remoteVersion==null&&Date\.now\(\)-eventLiveFullFetchAt<10000/, "sem a pergunta leve, o evento inteiro não é baixado mais que a cada 10 s");
assert.match(html, /visibilitychange[^\n]*refreshOpenEventFromCloud/, "ao voltar para o app, confere na hora");
assert.match(html, /eventCollaboration\.getEventVersion\(currentSdId\)/, "a conferência usa a versão leve");

const values = new Map();
let mode = "novo";
let version = 4;
const calls = [];
global.window = global;
global.storage = { get: (key, fallback) => values.has(key) ? values.get(key) : fallback, set: (key, value) => { values.set(key, value); return true; } };
global.apiConfig = { collaborationEndpoint: (path) => "https://api.example/api/collaboration" + path };
global.appAuth = { getState: () => ({ authenticated: true, user: { id: "user-1" } }), getAccessToken: () => "token" };
global.eventModel = { create: (value) => value };
function response(status, body) { return { ok: status >= 200 && status < 300, status, json: async () => body }; }
global.fetch = async (url) => {
  calls.push(url);
  if (url.endsWith("/events/event-1/version")) {
    if (mode === "offline") throw new Error("sem rede");
    return response(200, { id: "event-1", remoteVersion: version });
  }
  if (url.endsWith("/events/event-gone/version")) return response(404, { erro: { codigo: "evento_nao_encontrado", mensagem: "x" } });
  throw new Error("Rota inesperada: " + url);
};
require("../js/event-collaboration-client.js");

(async () => {
  const client = global.eventCollaboration;
  assert.equal(await client.getEventVersion("event-1"), 4);
  version = 5;
  assert.equal(await client.getEventVersion("event-1"), 5);

  // Evento apagado: não desliga a conferência leve para os outros eventos.
  assert.equal(await client.getEventVersion("event-gone"), null);
  assert.equal(await client.getEventVersion("event-1"), 5);

  // Servidor antigo ou navegador bloqueando (o fetch falha): devolve null para o app
  // usar o caminho completo, e não pergunta de novo por 5 minutos.
  mode = "offline";
  assert.equal(await client.getEventVersion("event-1"), null);
  const before = calls.length;
  assert.equal(await client.getEventVersion("event-1"), null);
  assert.equal(calls.length, before, "depois de uma falha, espera antes de perguntar de novo");

  const realNow = Date.now;
  Date.now = () => realNow() + 6 * 60 * 1000;
  mode = "novo";
  assert.equal(await client.getEventVersion("event-1"), 5, "depois de 5 minutos volta a usar a pergunta leve");
  Date.now = realNow;

  console.log("event-version-poll.test.js: OK");
})().catch((error) => { console.error(error); process.exit(1); });
