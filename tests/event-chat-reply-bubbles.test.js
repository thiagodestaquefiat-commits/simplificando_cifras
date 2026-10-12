const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('index.html', 'utf8');
const css = fs.readFileSync('js/event-detail-refactor.css', 'utf8');

assert.match(html, /EVENT_CHAT_PARTICIPANT_COLORS=\['#FF8A70','#F17C99','#ED78C5','#B39DFF','#C18AF0','#9FA8FF','#73B8FF','#62CEDB','#58D6C2','#55D6A0','#A6CF70','#E9CC72','#FFB86B','#F5A064','#F59AAB','#D59BE8'\]/);
assert.match(html, /EVENT_CHAT_PARTICIPANT_COLOR_KEY='sc_event_chat_participant_colors_v1'/);
assert.match(html, /\[\.\.\.ids\]\.sort\(\)/, 'a distribuição deve partir de IDs estáveis, não da ordem das mensagens');
assert.match(html, /new Map\(\[\[selfId,'#0789E7'\]\]\)/, 'Você deve usar exclusivamente o azul ROUDY');
assert.match(html, /--event-reply-author-color/, 'a citação deve receber a cor do autor original');
assert.match(css, /\.event-message-bubble\{[^}]*width:fit-content[^}]*max-width:100%/);
assert.match(css, /\.event-message-reply-context[^}]*width:100%[^}]*border-left:3px solid var\(--event-reply-author-color/);
assert.match(css, /\.event-message-reply-quote\{[^}]*overflow-wrap:anywhere[^}]*white-space:normal/);
assert.match(css, /\.event-message-time\{[^}]*float:right[^}]*white-space:nowrap/);

console.log('event-chat-reply-bubbles.test.js: OK (geometria, citações e 16 cores estáveis)');
