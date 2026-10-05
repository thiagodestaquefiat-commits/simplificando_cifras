const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const deliveryContext = {};
vm.createContext(deliveryContext);
vm.runInContext(fs.readFileSync('js/context-delivery.js', 'utf8'), deliveryContext);
const delivery = deliveryContext.contextDelivery;
const events = [{ id: 'event-1', title: 'Culto', repertoire: [{ id: 'item-1', shared: { title: 'A alegria' } }] }];

assert.equal(delivery.select({ actionType: 'NONE' }, { events }).surface, 'NONE');
const review = { actionType: 'REVIEW_CHANGED_SONG', eventId: 'event-1', repertoireItemId: 'item-1', fingerprint: 'review-1', destination: { view: 'song' }, evidence: { evidenceIncomplete: false } };
const reviewPresentation = delivery.select(review, { events });
assert.equal(reviewPresentation.surface, 'HOME');
assert.equal(reviewPresentation.copy.title, 'A alegria mudou desde a sua preparação.');
assert.equal(reviewPresentation.copy.actionLabel, 'Revisar alteração');
const incomplete = delivery.copyFor({ ...review, evidence: { evidenceIncomplete: true } }, events);
assert.doesNotMatch(incomplete.description, /G\s*→|→\s*A/, 'evidência incompleta não inventa before/after');

const start = delivery.copyFor({ actionType: 'START_PREPARATION', eventId: 'event-1', evidence: { pendingCount: 5 } }, events);
assert.match(start.description, /5 músicas/);
const continueCopy = delivery.copyFor({ actionType: 'CONTINUE_PREPARATION', eventId: 'event-1', evidence: { pendingCount: 3 } }, events);
assert.match(continueCopy.description, /faltam 3 músicas/);
assert.equal(delivery.copyFor({ actionType: 'ENTER_STAGE_MODE', eventId: 'event-1', evidence: {} }, events).actionLabel, 'Modo Palco');

const values = new Map();
const ackContext = {
  Date,
  storage: { get: (key, fallback) => values.has(key) ? values.get(key) : fallback, set: (key, value) => (values.set(key, value), true) },
  eventCollaboration: {
    acknowledgeContextAction: async value => ({ acknowledgement: { ...value, id: 'ack-1', syncState: undefined } }),
    listContextAcknowledgements: async () => ({ acknowledgements: [] })
  }
};
vm.createContext(ackContext);
vm.runInContext(fs.readFileSync('js/context-acknowledgements.js', 'utf8'), ackContext);
const acknowledgements = ackContext.contextAcknowledgements;
const local = acknowledgements.acknowledgeLocal(review, 'user-a', '2026-10-05T12:00:00Z');
assert.equal(local.syncState, 'pending');
assert.deepEqual(Array.from(acknowledgements.fingerprints('user-b')), [], 'usuário B não herda acknowledgement de A');
assert.deepEqual(Array.from(acknowledgements.fingerprints('user-a')), ['review-1']);
assert.equal(acknowledgements.acknowledgeLocal(review, 'user-a').acknowledgedAt, '2026-10-05T12:00:00Z', 'acknowledgement é idempotente');
(async () => {
const synced = await acknowledgements.syncOne(local);
assert.equal(synced.syncState, 'synced');

const html = fs.readFileSync('index.html', 'utf8');
const openSong = html.slice(html.indexOf('function openDetail(id'), html.indexOf('function openDetailFromPlaylist'));
assert.doesNotMatch(openSong, /markLocal|markSongAsReviewed/, 'abrir música não confirma preparação');
const confirmSong = html.slice(html.indexOf('async function confirmCurrentSongPreparation'), html.indexOf('function openStageFromEvent'));
assert.match(confirmSong, /preparationReceipts\.markLocal/, 'confirmação explícita cria receipt local');
assert.match(confirmSong, /preparationReceipts\.syncOne/, 'receipt local segue para sincronização');
assert.match(html, /context_action_presented/);
assert.match(html, /context_action_opened/);
assert.match(html, /context_action_acknowledged/);
assert.match(html, /context_action_resolved/);
assert.match(html, /if\(action\.actionType==='ENTER_STAGE_MODE'\)\{openStageFromEvent/);
assert.match(html, /Contextual delivery indisponível; mantendo a Home atual/);

console.log('context-delivery.test.js: OK');
})().catch(error => { console.error(error); process.exitCode = 1; });
