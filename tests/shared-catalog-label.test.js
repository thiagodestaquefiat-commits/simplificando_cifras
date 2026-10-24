// A política restritiva mantém explícito que a cifra fornecida pelo usuário é conteúdo pessoal.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
assert.match(html, /Privada · conteúdo fornecido por você/);
assert.match(html, /<div class="full-chord-private">/);
console.log("shared-catalog-label ok (política restritiva preservada)");
