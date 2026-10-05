const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const context = { console, Date };
vm.createContext(context);
vm.runInContext(fs.readFileSync('js/context-intelligence.js', 'utf8'), context);
const engine = context.roudyContextIntelligence;
const now = '2026-10-05T12:00:00-03:00';

function preparation(state, overrides = {}) {
  return {
    state, reviewedAt: state === 'NOT_STARTED' ? null : '2026-10-04T10:00:00Z',
    reviewedRevision: state === 'NOT_STARTED' ? null : 'rev-old', currentRevision: state === 'CHANGED_AFTER_REVIEW' ? 'rev-new' : 'rev-old',
    relevantChanges: [], evidenceIncomplete: false, ...overrides
  };
}
function item(id, state, overrides = {}) {
  return { id: `item-${id}`, songId: `song-${id}`, order: Number(id) || 0, shared: { key: 'G' }, personalEdits: {}, preparation: preparation(state, overrides) };
}
function event(overrides = {}) {
  return {
    id: 'event-1', title: 'Evento', date: '2026-10-06', time: '12:00', bandId: 'band-1',
    members: [{ id: 'user-a', role: 'Guitarra' }], repertoire: [item('1', 'READY')], notifications: [], ...overrides
  };
}
function evaluate(eventValues, userId = 'user-a', options) {
  return engine.evaluate({ now, user: { id: userId }, bands: [{ id: 'band-1', name: 'Banda' }], events: Array.isArray(eventValues) ? eventValues : [eventValues] }, options);
}

const distantReady = evaluate(event({ date: '2026-10-20' }));
assert.equal(distantReady.nextBestAction.actionType, 'NONE');
assert.equal(distantReady.nextBestAction.reasonCode, 'ALL_READY');

const tomorrowReady = evaluate(event());
assert.equal(tomorrowReady.nextBestAction.actionType, 'NONE');
assert.equal(tomorrowReady.nextBestAction.reasonCode, 'ALL_READY');

const tomorrowPending = evaluate(event({ repertoire: [item('1', 'NOT_STARTED')] }));
assert.equal(tomorrowPending.nextBestAction.actionType, 'START_PREPARATION');
assert.equal(tomorrowPending.nextBestAction.priority, 'HIGH');

const keyChange = { type: 'KEY_CHANGED', before: 'G', after: 'A', changedAt: '2026-10-05T10:00:00Z' };
const tomorrowKeyChanged = evaluate(event({ repertoire: [item('1', 'CHANGED_AFTER_REVIEW', { relevantChanges: [keyChange] })] }));
assert.equal(tomorrowKeyChanged.nextBestAction.actionType, 'REVIEW_CHANGED_SONG');
assert.equal(tomorrowKeyChanged.nextBestAction.reasonCode, 'KEY_CHANGED');
assert.equal(tomorrowKeyChanged.nextBestAction.priority, 'HIGH');

const structureChange = { type: 'STRUCTURE_CHANGED', before: { sha256: 'a' }, after: { sha256: 'b' }, changedAt: '2026-10-05T10:00:00Z' };
const tomorrowStructureChanged = evaluate(event({ repertoire: [item('1', 'CHANGED_AFTER_REVIEW', { relevantChanges: [structureChange] })] }));
assert.equal(tomorrowStructureChanged.nextBestAction.actionType, 'REVIEW_CHANGED_SONG');
assert.equal(tomorrowStructureChanged.nextBestAction.reasonCode, 'STRUCTURE_CHANGED');

const distantChanged = evaluate(event({ date: '2026-11-04', repertoire: [item('1', 'CHANGED_AFTER_REVIEW', { relevantChanges: [keyChange] })] }));
assert.equal(distantChanged.candidates[0].priority, 'LOW');
assert.equal(distantChanged.nextBestAction.actionType, 'NONE');
assert.equal(distantChanged.nextBestAction.reasonCode, 'EVENT_TOO_DISTANT');

const maskedPersonalization = evaluate(event({
  repertoire: [item('1', 'READY')],
  notifications: [{ id: 'official-key', changeType: 'KEY_CHANGED', songId: 'song-1', createdAt: '2026-10-05T10:00:00Z', affectedUsers: ['user-a'] }]
}));
assert.equal(maskedPersonalization.nextBestAction.actionType, 'NONE', 'receipt efetivo READY vence mudança oficial mascarada');

const aggregated = evaluate(event({ repertoire: [item('1', 'NOT_STARTED'), item('2', 'NOT_STARTED'), item('3', 'NOT_STARTED')] }));
assert.equal(aggregated.nextBestAction.actionType, 'START_PREPARATION');
assert.equal(aggregated.nextBestAction.evidence.pendingCount, 3);
assert.equal(aggregated.candidates.filter(candidate => candidate.actionType === 'START_PREPARATION').length, 1);

const competition = evaluate(event({ repertoire: [
  item('1', 'CHANGED_AFTER_REVIEW', { relevantChanges: [keyChange] }), item('2', 'NOT_STARTED'), item('3', 'NOT_STARTED')
] }));
assert.equal(competition.nextBestAction.actionType, 'REVIEW_CHANGED_SONG');
assert.match(competition.nextBestAction.diagnostic.winnerReason, /specific actionable change/);
assert.ok(competition.nextBestAction.diagnostic.competingCandidates.some(candidate => candidate.actionType === 'CONTINUE_PREPARATION'));

const past = evaluate(event({ date: '2026-10-01' }));
assert.equal(past.nextBestAction.actionType, 'NONE');
assert.equal(past.nextBestAction.reasonCode, 'EVENT_PAST');

const insufficient = evaluate(event({ date: '', time: '', repertoire: [item('1', 'NOT_STARTED')] }));
assert.equal(insufficient.nextBestAction.actionType, 'NONE');
assert.equal(insufficient.nextBestAction.reasonCode, 'INSUFFICIENT_CONTEXT');

const musicianA = evaluate(event({ repertoire: [item('1', 'READY')] }), 'user-a');
const musicianBEvent = event({ members: [{ id: 'user-b', role: 'Vocal' }], repertoire: [item('1', 'NOT_STARTED')] });
const musicianB = evaluate(musicianBEvent, 'user-b');
assert.equal(musicianA.nextBestAction.actionType, 'NONE');
assert.equal(musicianB.nextBestAction.actionType, 'START_PREPARATION');

const twoEvents = evaluate([
  event({ id: 'far-event', date: '2026-11-04', repertoire: [item('1', 'CHANGED_AFTER_REVIEW', { relevantChanges: [keyChange] })] }),
  event({ id: 'near-event', repertoire: [item('2', 'NOT_STARTED')] })
]);
assert.equal(twoEvents.nextBestAction.eventId, 'near-event');
assert.equal(twoEvents.nextBestAction.actionType, 'START_PREPARATION');

const afterNewReceipt = evaluate(event({ repertoire: [item('1', 'READY', { reviewedRevision: 'rev-new', currentRevision: 'rev-new' })] }));
assert.equal(afterNewReceipt.nextBestAction.actionType, 'NONE');

const removedSong = evaluate(event({ repertoire: [] }));
assert.equal(removedSong.nextBestAction.actionType, 'NONE');

const duplicateSignalsEvent = event({ notifications: [
  { id: 'same', changeType: 'KEY_CHANGED', songId: 'song-1', createdAt: '2026-10-05T10:00:00Z' },
  { id: 'same', changeType: 'KEY_CHANGED', songId: 'song-1', createdAt: '2026-10-05T10:00:00Z' }
] });
const duplicateSignals = evaluate(duplicateSignalsEvent);
assert.equal(duplicateSignals.signals.filter(signal => signal.type === 'KEY_CHANGED').length, 1);

const noSignals = evaluate(event({ date: '2026-10-20', notifications: [] }));
assert.equal(noSignals.nextBestAction.actionType, 'NONE');

assert.equal(distantChanged.candidates[0].priority, 'LOW');
assert.equal(tomorrowKeyChanged.candidates[0].priority, 'HIGH');
assert.equal(tomorrowKeyChanged.nextBestAction.diagnostic.usedLlm, false);

const mixedSongs = evaluate(event({ repertoire: [item('1', 'READY'), item('2', 'NOT_STARTED')] }));
assert.equal(mixedSongs.snapshot.events[0].preparation.state, 'IN_PROGRESS');
assert.ok(mixedSongs.snapshot.events[0].preparation.songs.every(song => song.state !== 'IN_PROGRESS'));

const acknowledged = evaluate(event({ repertoire: [item('1', 'NOT_STARTED')] }));
const suppressed = evaluate(event({ repertoire: [item('1', 'NOT_STARTED')] }), 'user-a', { acknowledgedFingerprints: [acknowledged.nextBestAction.fingerprint] });
assert.equal(suppressed.nextBestAction.actionType, 'NONE');

const oldChanged = evaluate(event({ repertoire: [item('1', 'CHANGED_AFTER_REVIEW', {
  currentRevision: 'rev-change-1', relevantChanges: [keyChange]
})] }));
const newChanged = evaluate(event({ repertoire: [item('1', 'CHANGED_AFTER_REVIEW', {
  currentRevision: 'rev-change-2', relevantChanges: [{ ...keyChange, after: 'B', changedAt: '2026-10-05T11:00:00Z' }]
})] }), 'user-a', { acknowledgedFingerprints: [oldChanged.nextBestAction.fingerprint] });
assert.notEqual(newChanged.nextBestAction.fingerprint, oldChanged.nextBestAction.fingerprint, 'nova revisão gera nova fingerprint');
assert.equal(newChanged.nextBestAction.actionType, 'REVIEW_CHANGED_SONG', 'acknowledgement antigo não esconde nova mudança');

console.log('context-relevance-engine.test.js: OK');
