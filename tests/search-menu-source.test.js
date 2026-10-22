const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'js/search-menu.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css/search-menu.css'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8');

assert.match(html, /id="roudy-search"/);
assert.match(html, /id="tab-search"[\s\S]*?>Buscar<\/span>/, 'Buscar fica na navegação inferior ao lado de Home');
assert.match(html, /O que vamos tocar hoje\?/);
for (const label of ['Músicas', 'Minha playlist', 'Eventos', 'Medley']) assert.match(html, new RegExp(`>${label}<`));
for (const filter of ['all', 'playlist', 'external']) assert.match(html, new RegExp(`data-search-filter="${filter}"`));
assert.match(js, /sc_home_last_opened_song_v1/, 'retomada usa histórico real já existente');
assert.match(js, /global\.schedulePlaylistOnlineSearch/, 'busca externa reutiliza o mecanismo existente');
assert.match(js, /global\.openDetail/, 'resultado local abre o Estudo existente');
assert.match(js, /global\.homePlaylists\?\.setView/, 'atalhos reutilizam as telas existentes');
assert.doesNotMatch(js, /spotify|player|recommend/i, 'menu não introduz reprodução ou recomendações artificiais');
assert.match(css, /#0789e7/i);
assert.match(css, /prefers-reduced-motion/);
assert.match(sw, /css\/search-menu\.css\?v=9/);
assert.match(sw, /js\/search-menu\.js\?v=5/);

console.log('search-menu-source.test.js: OK');
