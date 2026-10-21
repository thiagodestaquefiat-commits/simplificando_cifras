// Música do catálogo compartilhado não pode aparecer como "Privada · conteúdo fornecido por você".
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
assert.doesNotMatch(html, /Privada · conteúdo fornecido por você/);
assert.doesNotMatch(html, /<div class="full-chord-private">/);
console.log("shared-catalog-label ok");
