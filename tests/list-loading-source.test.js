const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const loader = read('js/list-loading.js');
const search = read('js/search-menu.js');
const page = read('index.html');
const worker = read('service-worker.js');

const handlers = {};
const sandbox = {
  window: {
    document: { addEventListener: (type, handler) => { handlers[type] = handler; } },
    songArtwork: { resolveReal: song => song?.coverUrl || null }
  }
};
require('vm').runInNewContext(loader, sandbox);
const loading = sandbox.window.roudyListLoading;
assert.match(loading.artwork({}), /roudy-artwork-note/, 'sem capa deve haver nota musical imediatamente');
assert.doesNotMatch(loading.artwork({}), /data-roudy-artwork-image/, 'sem URL não deve haver imagem vazia');
assert.match(loading.artwork({ coverUrl: 'https://example.test/cover.jpg' }), /data-roudy-artwork-image/, 'com URL a imagem deve carregar sobre o fallback');
assert.strictEqual((loading.skeleton(3).match(/roudy-list-skeleton-row/g) || []).length, 3, 'o skeleton deve respeitar a quantidade de linhas pedida');
assert.ok(handlers.load && handlers.error, 'o carregamento e a falha de imagem devem ser tratados');

assert.match(loader, /roudy-list-skeleton/, 'o gerador de skeleton precisa existir');
assert.match(loader, /data-roudy-artwork-image/, 'a imagem individual precisa iniciar sobre o placeholder');
assert.match(loader, /is-loaded/, 'a capa deve aparecer somente após carregar');
assert.match(loader, /settle\(event\.target, false\)/, 'falha de imagem deve manter o fallback');
assert.match(search, /roudyListLoading\?\.skeleton\(5\)/, 'a busca assíncrona deve reservar o layout com skeleton');
assert.match(search, /roudyListLoading\?\.artwork\(song\)/, 'as listas locais devem usar o placeholder de arte');
assert.match(page, /js\/list-loading\.js\?v=1/, 'o novo módulo deve carregar antes das listas');
assert.match(worker, /simplificando-cifras-v686-song-artwork-clean-crop/, 'o cache deve invalidar recursos antigos');
assert.match(worker, /\.\/js\/list-loading\.js\?v=1/, 'o service worker deve pré-cachear o módulo');

console.log('list-loading-source.test.js: OK');
