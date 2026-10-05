const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const context = { console, Date };
vm.createContext(context);
vm.runInContext(fs.readFileSync('js/context-intelligence.js', 'utf8'), context);
const engine = context.roudyContextIntelligence;
const now = '2026-10-05T12:00:00-03:00';
const user = { id: 'user-a', name: 'Ana', role: 'Guitarra' };
function event(overrides = {}) {
  return {
    id: 'event-1', title: 'Culto', date: '2026-10-06', time: '12:00', bandId: 'band-1',
    members: [{ id: 'user-a', role: 'Guitarra' }],
    repertoire: [{ id: 'item-1', songId: 'song-1', order: 0, shared: { key: 'G' }, personalEdits: {} }],
    notifications: [], ...overrides
  };
}
function evaluate(eventValue, extra = {}, options) {
  return engine.evaluate({ now, user, bands: [{ id: 'band-1', name: 'ROUDY' }], events: [eventValue], ...extra }, options);
}

assert.equal(engine.eventPhase(event({ date: '2026-10-17' }), now).phase, 'FAR', 'evento distante');
assert.equal(engine.eventPhase(event(), now).phase, 'APPROACHING', 'evento amanhã');
assert.equal(engine.eventPhase(event({ date: '2026-10-05', time: '20:00' }), now).phase, 'TODAY', 'evento hoje');

const unknown = evaluate(event());
assert.equal(unknown.snapshot.events[0].preparation.state, 'UNKNOWN', 'não inventa preparo sem rastreamento');
assert.ok(unknown.snapshot.missingData.includes('preparationTracking'));

const notStarted = evaluate(event(), { preparationTrackingAvailable: true, preparationRecords: [] });
assert.equal(notStarted.snapshot.events[0].preparation.state, 'NOT_STARTED');
assert.ok(notStarted.signals.some(signal => signal.type === 'PREPARATION_PENDING'));

const inProgress = evaluate(event({ repertoire: [
  { id: 'item-1', songId: 'song-1', order: 0, shared: {} },
  { id: 'item-2', songId: 'song-2', order: 1, shared: {} }
] }), { preparationTrackingAvailable: true, preparationRecords: [{ eventId: 'event-1', userId: 'user-a', songId: 'song-1', status: 'READY', reviewedAt: '2026-10-04T10:00:00Z' }] });
assert.equal(inProgress.snapshot.events[0].preparation.state, 'IN_PROGRESS');

const ready = evaluate(event({ date: '2026-10-05', time: '20:00' }), { preparationTrackingAvailable: true, preparationRecords: [{ eventId: 'event-1', userId: 'user-a', songId: 'song-1', status: 'READY', reviewedAt: '2026-10-04T10:00:00Z' }] });
assert.equal(ready.snapshot.events[0].preparation.state, 'READY');
assert.equal(ready.nextBestAction.actionType, 'ENTER_STAGE_MODE', 'tudo pronto hoje prioriza palco');

const changed = evaluate(event({ notifications: [{ id: 'c1', kind: 'repertoire.key.updated', songId: 'song-1', createdAt: '2026-10-05T10:00:00Z', summary: 'Tom mudou de G para A', before: 'G', after: 'A' }] }), { preparationTrackingAvailable: true, preparationRecords: [{ eventId: 'event-1', userId: 'user-a', songId: 'song-1', status: 'READY', reviewedAt: '2026-10-04T10:00:00Z' }] });
assert.equal(changed.snapshot.events[0].preparation.state, 'CHANGED_AFTER_REVIEW', 'mudança de tom após revisão');
assert.ok(changed.signals.some(signal => signal.type === 'KEY_CHANGED'));
assert.equal(changed.nextBestAction.actionType, 'REVIEW_CHANGED_SONG');

const receiptDriven = evaluate(event({ repertoire: [{ id: 'item-1', songId: 'song-1', order: 0, shared: { key: 'A' }, preparation: {
  state: 'CHANGED_AFTER_REVIEW', reviewedAt: '2026-10-04T10:00:00Z', reviewedRevision: 'old', currentRevision: 'new',
  relevantChanges: [{ type: 'KEY_CHANGED', before: 'G', after: 'A', changedAt: '2026-10-05T10:00:00Z' }], evidenceIncomplete: false
} }] }));
assert.equal(receiptDriven.snapshot.events[0].preparation.state, 'CHANGED_AFTER_REVIEW', 'receipt do servidor dirige o estado');
assert.equal(receiptDriven.nextBestAction.actionType, 'REVIEW_CHANGED_SONG');

for (const kind of [['repertoire.song.added', 'SONG_ADDED'], ['repertoire.song.removed', 'SONG_REMOVED'], ['repertoire.song.updated', 'STRUCTURE_CHANGED']]) {
  const result = evaluate(event({ notifications: [{ id: kind[0], kind: kind[0], createdAt: '2026-10-05T10:00:00Z', summary: kind[0] }] }));
  assert.ok(result.signals.some(signal => signal.type === kind[1]), kind[1]);
}

const unaffected = engine.evaluate({ now, user, events: [event({ members: [{ id: 'user-b', role: 'Vocal' }] })] });
assert.equal(unaffected.snapshot.events.length, 0, 'isola eventos de outros usuários');
assert.equal(unaffected.nextBestAction.actionType, 'NONE');

const targetedAway = evaluate(event({ notifications: [{ id: 'c2', kind: 'repertoire.key.updated', createdAt: '2026-10-05T10:00:00Z', summary: 'Mudança', affectedUsers: ['user-b'] }] }));
assert.ok(!targetedAway.signals.some(signal => signal.type === 'KEY_CHANGED'), 'não sinaliza músico não afetado');

const incomplete = engine.evaluate({ now, user, events: [{ id: 'incomplete', title: 'Sem data', members: [{ id: 'user-a' }], repertoire: [] }] });
assert.equal(incomplete.snapshot.events[0].phase, 'UNKNOWN', 'contexto temporal incompleto');

const multipleBands = engine.evaluate({ now, user, bands: [{ id: 'b1', name: 'A' }, { id: 'b2', name: 'B' }], events: [event({ id: 'e1', bandId: 'b1' }), event({ id: 'e2', bandId: 'b2' })] });
assert.deepEqual(Array.from(multipleBands.snapshot.events, item => item.band.name).sort(), ['A', 'B'], 'múltiplas equipes');

const duplicateChange = event({ notifications: [
  { id: 'same', kind: 'event.updated', createdAt: '2026-10-05T10:00:00Z', summary: 'Mudou' },
  { id: 'same', kind: 'event.updated', createdAt: '2026-10-05T10:00:00Z', summary: 'Mudou' }
] });
const deduplicated = evaluate(duplicateChange);
assert.equal(deduplicated.signals.filter(signal => signal.type === 'REPERTOIRE_CHANGED').length, 1, 'deduplicação');

const noFuture = engine.evaluate({ now, user, events: [event({ date: '2026-09-01' })] });
assert.equal(noFuture.nextBestAction.actionType, 'NONE', 'sem evento futuro não inventa ação');
const expired = engine.evaluate({ now, user, events: [event({ date: '2026-09-01', notifications: [{ id: 'old', kind: 'repertoire.key.updated', createdAt: '2026-08-31T10:00:00Z', summary: 'Mudança antiga' }] })] });
assert.equal(expired.signals.length, 0, 'sinais de evento encerrado expiram');
assert.equal(noFuture.nextBestAction.explanation.usedLlm, false);

console.log('context-intelligence.test.js: OK');
