// Links compartilhados de dentro do preview aberto com ?api=producao levam o mesmo parâmetro.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const source = fs.readFileSync("js/ai/api-config.js", "utf8");
function load(href, session = {}) {
  const url = new URL(href);
  const window = { location: url, sessionStorage: { getItem: (k) => session[k] ?? null, setItem: (k, v) => { session[k] = v; }, removeItem: (k) => { delete session[k]; } }, document: { querySelector: () => ({ content: "https://api.roudy" }) } };
  new Function("window", source.replace(/\}\)\(window\);\s*$/, "})(window);"))(window);
  return window.apiConfig;
}
const link = () => new URL("https://x/?playlist=abc");
// Preview aberto com ?api=producao: o link leva api=producao.
assert.equal(load("https://deploy-preview-130--simplificandocifras.netlify.app/?api=producao").withPreviewApi(link()).searchParams.get("api"), "producao");
// Preview aberto antes com ?api=producao (guardado na aba), agora sem o parâmetro: continua levando.
assert.equal(load("https://deploy-preview-130--simplificandocifras.netlify.app/", { roudy_preview_api: "producao" }).withPreviewApi(link()).searchParams.get("api"), "producao");
// Preview com servidor próprio do PR: não acrescenta.
assert.equal(load("https://deploy-preview-130--simplificandocifras.netlify.app/").withPreviewApi(link()).searchParams.get("api"), null);
// App oficial: nunca acrescenta.
assert.equal(load("https://simplificandocifras.netlify.app/?api=producao").withPreviewApi(link()).searchParams.get("api"), null);
for (const file of ["js/home-playlists.js", "js/playlist-invites.js", "js/song-share.js"]) assert.match(fs.readFileSync(file, "utf8"), /withPreviewApi/, file + " usa o ajudante");
assert.equal((fs.readFileSync("index.html", "utf8").match(/apiConfig\.withPreviewApi\(new URL\(location\.pathname,location\.origin\)\)/g) || []).length, 2, "convites de evento usam o ajudante");
console.log("preview-share-links.test.js: OK");
