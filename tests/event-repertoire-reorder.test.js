const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('index.html', 'utf8');

assert.match(html, />Repertório oficial do evento<\/div>/);
assert.match(html, /event-section-title--repertoire\{[^}]*color:#f5f6f8[^}]*text-align:left[^}]*text-transform:none/);
assert.doesNotMatch(html, /Você é o líder: pode editar a versão oficial/);
assert.doesNotMatch(html, /Você é integrante: pode visualizar a versão oficial/);
assert.match(html, /class="event-repertoire-list"/);
assert.match(html, /class="event-reorder-handle"/);
assert.match(html, /Pressione e arraste para mudar/);
assert.match(html, /function startEventRepertoirePress\(/);
assert.match(html, /setTimeout\(\(\)=>\{[^]*navigator\.vibrate\?\.\(12\)\},280\)/);
assert.match(html, /function persistEventRepertoireOrder\(/);
assert.match(html, /eventModel\.canEditShared\(event,actor\.id\)/, 'somente o líder pode persistir a ordem');
assert.match(html, /repertoire\.order\.updated/);
assert.match(html, /handleEventReorderKey/, 'também permite reordenar pelo teclado');

console.log('event-repertoire-reorder.test.js: OK');
