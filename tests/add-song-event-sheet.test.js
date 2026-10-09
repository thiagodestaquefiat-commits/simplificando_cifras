const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('index.html', 'utf8');
const flow = html.slice(html.indexOf('let addSongEventSheetSongId'), html.indexOf('function deleteMusica'));

assert.match(html, /class="song-options-action song-options-save" onclick="openAddSongToRepertoire\(\)"/, 'menu contextual dos três pontos permanece como gatilho');
assert.match(flow, /function ensureAddSongEventSheet\(\)/);
assert.match(flow, /role="dialog" aria-modal="true"/);
assert.match(flow, /class="add-song-event-backdrop"/);
assert.match(flow, /addEventListener\('pointermove'/, 'sheet suporta arraste');
assert.match(flow, /distance>Math\.min\(120,sheet\.offsetHeight\*\.22\)/, 'arraste para baixo fecha');
assert.match(flow, /Já adicionada/);
assert.match(flow, /eventModel\.canEditShared/, 'permissões existentes são preservadas');
assert.match(flow, /event\.repertoire\.some/, 'duplicatas são prevenidas antes do toque');
assert.match(flow, /eventRepository\.upsert/);
assert.match(flow, /showEventSaveNotice\(event,song\)/);
assert.match(flow, /className='event-save-notice'/, 'confirmação usa snackbar contextual próprio');
assert.doesNotMatch(flow.slice(flow.indexOf('function openAddSongToRepertoire'), flow.indexOf('function addSongToEvent')), /modal-overlay|modal-body/, 'fluxo não usa mais modal genérico');
assert.match(html, /\.add-song-event-sheet\.is-open\{transition-duration:255ms;transition-timing-function:cubic-bezier\(\.2,\.78,\.2,1\)\}/, 'entrada segue o timing medido no vídeo');
assert.match(html, /\.add-song-event-sheet\{min-height:46dvh\}/, 'ocupação mobile acompanha a proporção da referência');
assert.match(html, /\?0:190/, 'fechamento é mais curto que a entrada');

console.log('add-song-event-sheet.test.js: OK');
