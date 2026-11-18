// Atualização do app não recarrega no meio do uso (jogava para a tela inicial "do nada").
const assert = require("node:assert/strict");
const html = require("node:fs").readFileSync("index.html", "utf8");
const start = html.indexOf("navigator.serviceWorker.addEventListener('controllerchange'");
const block = html.slice(start, html.indexOf("});", start) + 3);
assert.match(block, /swUpdatePending = true;/, "nova versão fica pendente");
assert.doesNotMatch(block, /reloadForUpdate\(\)/, "não recarrega na hora que a nova versão chega");
assert.match(html, /UPDATE_AFTER_HIDDEN_MS = 30 \* 60 \* 1000/, "só aplica ao voltar depois de 30 minutos fora");
console.log("no-reload-during-use.test.js: OK");
