const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync('index.html', 'utf8');
const start = html.indexOf('function openDetailFromEventItem(');
const end = html.indexOf('function openStageFromEvent(', start);
assert.ok(start >= 0 && end > start, 'a abertura por item do repertório deve existir');

const event = { id: 'evento', repertoire: [
  { id: 'primeiro', songId: 'a' },
  { id: 'indisponivel', songId: 'b' },
  { id: 'terceiro', songId: 'c' }
] };
const opened = [];
const toasts = [];
const context = {
  findEvent: id => id === event.id ? event : null,
  musicas: [{ id: 'a' }, { id: 'c' }],
  openDetailFromPlaylist: (eventId, index) => opened.push([eventId, index]),
  showToast: message => toasts.push(message)
};
vm.createContext(context);
vm.runInContext(html.slice(start, end), context);

context.openDetailFromEventItem('evento', 'terceiro');
assert.deepEqual(opened, [['evento', 1]], 'a terceira música visível deve usar seu índice na lista disponível');
event.repertoire.reverse();
context.openDetailFromEventItem('evento', 'terceiro');
assert.deepEqual(opened[1], ['evento', 0], 'a música clicada deve continuar correta após reordenação');
context.openDetailFromEventItem('evento', 'indisponivel');
assert.equal(opened.length, 2, 'uma música indisponível não deve abrir outra');
assert.equal(toasts.length, 1, 'uma música indisponível deve informar o usuário');

const eventView = html.slice(html.indexOf('function openSD('), html.indexOf('function changeEventOfficialKey('));
assert.match(eventView, /const availableItems=event\.repertoire\.filter\(/);
assert.match(eventView, /const rows=availableItems\.map\(/);
assert.match(eventView, /onclick="openDetailFromEventItem\(\$\{attrJs\(event\.id\)\},\$\{attrJs\(item\.id\)\}\)"/);
console.log('event-repertoire-click.test.js: OK');
