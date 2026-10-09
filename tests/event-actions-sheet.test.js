const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('index.html', 'utf8');
const songMenu = html.slice(html.indexOf('let songOptionsTrigger'), html.indexOf('function removeSongFromOptions'));
const eventMenu = html.slice(html.indexOf('function openEventMoreActions'), html.indexOf('let eventParticipantsMorphCleanup'));

assert.match(songMenu, /songOptionsDrag/);
assert.match(songMenu, /Math\.hypot[\s\S]*?>7[\s\S]*?closeSongOptions\(\{restoreFocus:false\}\)/, 'arrastar sobre o backdrop fecha o balão');
assert.match(html, /document\.addEventListener\('scroll',[\s\S]*?closeSongOptions\(\{restoreFocus:false\}\)/, 'rolar fecha o balão');
assert.match(html, /\.music-item-more\.is-menu-trigger\{background:transparent;color:inherit;opacity:\.42\}/, 'três pontos só ficam atenuados enquanto o menu está aberto');
assert.match(html, /className='event-save-notice'/);
assert.match(html, />Alterar<\/button>/);
assert.match(eventMenu, />Adicionar pessoa</);
assert.match(eventMenu, />Excluir evento</);
assert.match(eventMenu, /openEventInviteSheet/);
assert.match(eventMenu, /Convidar como participante/);
assert.match(eventMenu, /event-invite-preview/);
assert.match(eventMenu, /roudyEventShare\.cardMarkup\(shareData\)/, 'o convite reutiliza o card visual oficial do evento');
assert.match(eventMenu, />Transferir liderança</, 'ações administrativas ficam no menu contextual');
assert.match(eventMenu, /eventUserInvites\.openSearchSheet\(eventId\)/, 'a lupa abre a busca dedicada sem abrir o editor do evento');
const inviteSource = fs.readFileSync('js/event-user-invites.js', 'utf8');
assert.match(inviteSource, /event-people-search-title">Compartilhar com/);
assert.match(inviteSource, /event-people-search-input/);
assert.match(inviteSource, /eventCollaboration\.searchUsers/);
assert.match(inviteSource, /eventCollaboration\.inviteUser\(eventId,user\.id,'Outra'\)/);

console.log('event-actions-sheet.test.js: OK');
