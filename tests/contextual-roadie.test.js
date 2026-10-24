const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const context = { console, Date };
vm.createContext(context);
vm.runInContext(fs.readFileSync('js/context-intelligence.js', 'utf8'), context);
const engine = context.roudyContextIntelligence;
const user = { id: 'roadie-user', name: 'Bia' };
const now = '2026-10-23T12:00:00-03:00';
const ready = state => ({ state, reviewedAt: state === 'NOT_STARTED' ? null : '2026-10-22T10:00:00Z', reviewedRevision: 'r1', currentRevision: 'r1', relevantChanges: [], evidenceIncomplete: false });
const item = (id, state = 'UNKNOWN') => ({ id: `item-${id}`, songId: `song-${id}`, order: Number(id), shared: { title: `Música ${id}`, key: 'G' }, preparation: ready(state) });
function event(days, overrides = {}) {
  const date = new Date('2026-10-23T12:00:00-03:00'); date.setDate(date.getDate() + days);
  return { id: `event-${days}`, title: `Evento ${days}`, date: date.toISOString().slice(0, 10), time: '19:00', members: [{ id: user.id }], repertoire: [item('1')], notifications: [], ...overrides };
}
function evaluate(events, extra = {}, options = {}) { return engine.evaluate({ now, user, events: Array.isArray(events) ? events : [events], ...extra }, options); }

assert.equal(engine.eventPhase(event(7), now).moment, 'WITHIN_WEEK');
assert.equal(engine.eventPhase(event(3), now).moment, 'THREE_DAYS');
assert.equal(engine.eventPhase(event(1), now).moment, 'TOMORROW');
assert.equal(engine.eventPhase(event(0), now).moment, 'TODAY');

const empty = evaluate(event(3, { repertoire: [] }));
assert.equal(empty.nextBestAction.actionType, 'OPEN_UPCOMING_EVENT');
assert.equal(empty.nextBestAction.reasonCode, 'UPCOMING_EVENT_EMPTY');

assert.equal(evaluate(event(1, { status: 'cancelado' })).snapshot.events.length, 0);
assert.equal(evaluate(event(-1)).nextBestAction.actionType, 'NONE');

const keyChange = event(3, { notifications: [{ id: 'key-1', changeType: 'KEY_CHANGED', songId: 'song-1', before: 'G', after: 'A', createdAt: '2026-10-23T14:00:00Z' }] });
assert.equal(evaluate(keyChange).nextBestAction.actionType, 'CHECK_EVENT_CHANGES');
const earlierChange = evaluate(event(3, { notifications: [{ id: 'old-change', changeType: 'SONG_REMOVED', songId: 'song-old', createdAt: '2026-10-23T12:30:00Z' }] })).nextBestAction;
const freshChangeAfterRecentMessage = evaluate(keyChange, {}, { history: [{ fingerprint: earlierChange.fingerprint, eventId: 'event-3', category: 'changes', presentedAt: '2026-10-23T11:59:00-03:00' }] });
assert.equal(freshChangeAfterRecentMessage.nextBestAction.actionType, 'CHECK_EVENT_CHANGES', 'mudança nova não é bloqueada pela supressão do evento');
assert.notEqual(freshChangeAfterRecentMessage.nextBestAction.fingerprint, earlierChange.fingerprint);
const added = event(3, { notifications: [{ id: 'add-1', changeType: 'SONG_ADDED', songId: 'song-2', createdAt: '2026-10-23T14:00:00Z' }] });
assert.equal(evaluate(added).nextBestAction.actionType, 'CHECK_EVENT_CHANGES');
const removed = event(3, { notifications: [{ id: 'remove-1', changeType: 'SONG_REMOVED', songId: 'song-2', createdAt: '2026-10-23T14:00:00Z' }] });
assert.equal(evaluate(removed).nextBestAction.actionType, 'CHECK_EVENT_CHANGES');

const ownChange = event(3, { notifications: [{ id: 'own-key-1', actorId: user.id, changeType: 'KEY_CHANGED', songId: 'song-1', before: 'G', after: 'A', createdAt: '2026-10-23T14:00:00Z' }] });
const ownChangeResult = evaluate(ownChange);
assert.equal(ownChangeResult.signals.some(signal => signal.source === 'event-change'), false, 'alteração do próprio usuário não gera sinal contextual');
assert.notEqual(ownChangeResult.nextBestAction.actionType, 'CHECK_EVENT_CHANGES', 'alteração do próprio usuário não pede conferência');

const ownTrackedItem = { ...item('1') };
delete ownTrackedItem.preparation;
const ownChangeAfterReview = evaluate({ ...ownChange, repertoire: [ownTrackedItem] }, {
  preparationTrackingAvailable: true,
  preparationRecords: [{ eventId: 'event-3', userId: user.id, songId: 'song-1', status: 'READY', reviewedAt: '2026-10-23T13:00:00Z' }]
});
assert.equal(ownChangeAfterReview.snapshot.events[0].preparation.state, 'READY', 'alteração própria não invalida a preparação confirmada para fins de aviso');
assert.notEqual(ownChangeAfterReview.nextBestAction.actionType, 'REVIEW_CHANGED_SONG', 'alteração própria não sugere revisar novamente');

const preparation = evaluate(event(3, { repertoire: [item('1', 'NOT_STARTED')] }));
assert.equal(preparation.nextBestAction.actionType, 'START_PREPARATION');
const shown = [{ fingerprint: preparation.nextBestAction.fingerprint, eventId: preparation.nextBestAction.eventId, category: 'preparation', presentedAt: '2026-10-23T11:59:00-03:00' }];
const afterImmediateReopen = evaluate(event(3, { repertoire: [item('1', 'NOT_STARTED')] }), {}, { history: shown });
assert.equal(afterImmediateReopen.nextBestAction.actionType, 'NONE', 'não troca por incentivo inferior na abertura seguinte');

const activity = { eventId: 'event-3', repertoireItemId: 'item-1', songId: 'song-1', openedAt: '2026-10-23T10:00:00-03:00' };
const continuity = evaluate(event(3), { activity });
assert.equal(continuity.nextBestAction.actionType, 'CONTINUE_STUDY');
assert.equal(continuity.nextBestAction.evidence.openedAt, activity.openedAt);
const inaccessibleContinuity = evaluate(event(3, { repertoire: [{ ...item('1'), accessible: false }] }), { activity });
assert.notEqual(inaccessibleContinuity.nextBestAction.actionType, 'CONTINUE_STUDY', 'música inacessível não oferece retomada');

const unknownToday = evaluate(event(0));
assert.equal(unknownToday.nextBestAction.actionType, 'OPEN_UPCOMING_EVENT');
assert.equal(unknownToday.nextBestAction.evidence.preparationState, 'UNKNOWN');

const recognized = evaluate(event(3, { repertoire: [item('1', 'READY')] }));
assert.equal(recognized.nextBestAction.actionType, 'RECOGNIZE_PREPARATION');
assert.equal(recognized.nextBestAction.evidence.readyCount, 1);

const twoEvents = evaluate([event(7, { id: 'event-far', repertoire: [item('1', 'NOT_STARTED')] }), event(1, { id: 'event-near', repertoire: [item('2', 'NOT_STARTED')] })]);
assert.equal(twoEvents.nextBestAction.eventId, 'event-near');

const offline = evaluate(event(3, { repertoire: [item('1', 'NOT_STARTED')] }));
assert.equal(offline.nextBestAction.diagnostic.usedLlm, false);
assert.doesNotMatch(fs.readFileSync('js/context-intelligence.js', 'utf8'), /fetch\(|XMLHttpRequest|WebSocket/);

console.log('contextual-roadie.test.js: OK');
