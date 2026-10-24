// Decisão do Thiago (24/10/2026): a página Letra e cifra não mostra mais o texto fixo
// "Privada · conteúdo fornecido por você" — com a força-tarefa, música completada vai para o
// catálogo compartilhado e o texto ficou enganoso.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
assert.doesNotMatch(html, /Privada · conteúdo fornecido por você/);
assert.doesNotMatch(html, /<div class="full-chord-private">/);
console.log("shared-catalog-label ok (texto 'Privada' removido)");
