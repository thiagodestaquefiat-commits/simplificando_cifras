const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const html = fs.readFileSync(require("node:path").resolve(__dirname, "..", "index.html"), "utf8");
const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map((match) => match[1]).filter((source) => source.trim());
assert.ok(scripts.length > 0, "index.html deve possuir scripts inline");
scripts.forEach((source, index) => new vm.Script(source, { filename: `index-inline-${index + 1}.js` }));
const musicPane = html.slice(html.indexOf('id="pane-musicas"'), html.indexOf('id="pane-setlists"'));
assert.ok(musicPane.indexOf('class="youtube-panel"') < musicPane.indexOf('class="search-bar"'), "a busca do YouTube deve aparecer antes da busca da playlist");
assert.match(musicPane, /placeholder="Buscar música na playlist"/);
assert.match(musicPane, /Encontre um vídeo para adicionar à sua playlist/);
assert.match(musicPane, /ai-generate-action/, "a integração não deve remover o atalho de IA já aprovado no PR #48");
assert.match(musicPane, /aria-label="Limpar busca do YouTube"/);
assert.match(musicPane, /aria-label="Limpar busca da playlist"/);
console.log(`index-syntax.test.js: OK (${scripts.length} scripts)`);
