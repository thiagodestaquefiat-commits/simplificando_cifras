const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('index.html', 'utf8');
const css = fs.readFileSync('js/event-detail-refactor.css', 'utf8');

assert.match(html, /event-detail-refactor\.css\?v=33/);
assert.match(html, /bubble\.appendChild\(context\)/, 'a resposta citada deve ficar dentro da bolha');
assert.match(html, /\+\(mine\?' ✓✓':''\)/, 'mensagens próprias exibem confirmação');
assert.match(css, /background:#202120;color:#f4f4f5/, 'bolha recebida usa grafite');
assert.match(css, /background:#0b5c42;color:#f7f7f7/, 'bolha enviada usa verde');
assert.match(css, /event-message\.is-group-end:not\(\.mine\).*::after/, 'bolha recebida tem cauda');
assert.match(css, /event-message\.mine\.is-group-end.*::after/, 'bolha enviada tem cauda');
assert.match(css, /event-message-time\{display:inline-block;float:right/, 'horário fica no canto inferior');
assert.match(css, /event-message-reply-context\.is-own-source/, 'resposta citada diferencia o autor');

console.log('event-chat-message-ui.test.js: OK');
