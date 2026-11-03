const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');

assert.match(html, /\.inline-block-actions button\{[^}]*border-radius:999px/, 'ações usam o padrão pílula');
assert.match(html, /\.inline-block-actions button\{[^}]*font-family:"SF Pro Text",-apple-system,BlinkMacSystemFont,sans-serif!important[^}]*font-size:13px!important[^}]*font-weight:650!important[^}]*line-height:1!important/, 'Excluir, Cancelar e Salvar usam SF Pro Text no editor inline sem herdar a fonte musical');
assert.match(html, /\.inline-block-actions button\.primary\{[^}]*background:#287be8[^}]*color:#fff/, 'Salvar preserva hierarquia primária azul');
assert.match(html, /\.inline-block-delete\{[^}]*margin-right:auto[^}]*color:#e66b68/, 'Excluir fica separado e usa vermelho discreto');
assert.match(html, /Excluir este bloco\?/);
assert.match(html, /As cifras e a letra deste bloco serão removidas\./);
assert.match(html, /chunks\.splice\(index,1\)/, 'exclusão de Letra + Cifras remove somente a seção escolhida');
assert.match(html, /sections:model\.sections\.filter\(\(_section,sectionIndex\)=>sectionIndex!==index\)/, 'exclusão harmônica preserva as demais seções e sua ordem');
assert.match(html, /commitInlineSongEdit\(song,candidate,'✅ Bloco excluído'\)/, 'exclusão reutiliza persistência e permissões do editor inline');
assert.match(html, /role="alertdialog" aria-modal="true"/, 'confirmação é modal e acessível');

console.log('inline-block-editor-source.test.js: OK');
