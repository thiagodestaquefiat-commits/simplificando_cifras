const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const serviceWorker = fs.readFileSync(path.join(__dirname, '..', 'service-worker.js'), 'utf8');
const start = html.indexOf('function eventParticipantsMarkup(event)');
const end = html.indexOf('function setupEventParticipantsMorph()', start);
const markup = html.slice(start, end);
const morphStart = end;
const morphEnd = html.indexOf('function openEventMemberEditor', morphStart);
const morph = html.slice(morphStart, morphEnd);

assert.ok(start > 0 && end > start, 'renderização de participantes existe');
assert.match(markup, /event\.members/);
assert.match(markup, /event\.leaderId/);
assert.match(markup, /member\.avatarUrl|eventMemberAvatar\(member\)/);
assert.match(markup, /visibleLimit=9/);
assert.match(markup, /event-participants-remaining/);
assert.match(markup, /event-participants-add/);
assert.doesNotMatch(markup, /<li[^>]+onclick=/, 'participantes não são clicáveis');
assert.doesNotMatch(markup, /event-member-id/, 'IDs internos não aparecem na consulta');
assert.match(morph, /requestAnimationFrame/);
assert.match(morph, /prefers-reduced-motion/);
assert.match(morph, /addEventListener\('scroll'.*passive:true/);
assert.match(morph, /translate3d/);
assert.match(morph, /compactX.*progress/);
assert.match(html, /\.event-participants-section \.event-member-card\{[^}]*pointer-events:none;cursor:default/);
assert.doesNotMatch(html, /\.event-participants-section \.event-member-card:hover/);
assert.match(markup, /event-leader-orbit-label/);
assert.match(serviceWorker, /v264-youtube-add-microinteraction/);

console.log('event-participants-morph.test.js: OK');
