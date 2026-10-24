// Membro sem a música na biblioteca precisa ver o repertório do evento
// usando a cópia que veio com o evento (item.shared.songData).
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const start = html.search(/function openSD\(id(?:,options=\{\})?\)\{/);
assert.ok(start >= 0, 'openSD não encontrado');
const body = html.slice(start, html.indexOf('const rows=', start) + 2000);

assert.match(
  body,
  /const song=musicas\.find\(value=>String\(value\.id\)===String\(item\.songId\)\)\|\|eventSongSource\(event,item\);if\(!song\)return'';/,
  'a lista do evento deve usar a cópia do evento quando a música não está na biblioteca de quem abre'
);

console.log('event-member-song-copy.test.js: OK');
