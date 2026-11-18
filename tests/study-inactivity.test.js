const test = require('node:test');
const assert = require('node:assert/strict');
const evidence = require('../js/study-evidence.js');
const copy = require('../js/contextual-copy.js');
const DAY = 86400000, now = Date.parse('2026-11-18T12:00:00Z');
function input(days = 7) {
  return { now, userId: 'u', songs: [{ id: 's', title: 'Música' }], state: { userId: 'u', enabled: true, sessions: [{ id: 'session', songKey: 's', qualifiedAt: now - days * DAY, lastEvidenceAt: now - days * DAY, consumedAt: now - DAY }] } };
}
test('inactivity uses recorded evidence at seven days, regardless of consumed recognition', () => {
  assert.equal(evidence.inactivityCandidate(input(6.999)), null);
  const action = evidence.inactivityCandidate(input());
  assert.equal(action.actionType, 'RESUME_AFTER_INACTIVITY');
  assert.equal(action.evidence.inactiveDays, 7);
  assert.deepEqual(action.destination, { view: 'song', songId: 's' });
  assert.equal(action.evidence.preparationState, undefined);
});
test('no invitation without usable private evidence and live destination', () => {
  for (const mutate of [i => i.state.sessions = [], i => i.state.enabled = false, i => i.userId = 'other', i => i.songs = [], i => i.state.sessions[0].lastEvidenceAt = now + DAY]) {
    const value = input(); mutate(value); assert.equal(evidence.inactivityCandidate(value), null);
  }
  assert.equal(evidence.inactivityCandidate(input(90)), null);
  const value = input(); value.state.sessions.push({ id: 'new', songKey: 's', qualifiedAt: now - DAY, lastEvidenceAt: now - DAY });
  assert.equal(evidence.inactivityCandidate(value), null);
});
test('all six requested invitations resolve independently of event preparation', () => {
  const action = evidence.inactivityCandidate(input()), seen = new Set();
  for (let n = 0; n < 100; n++) {
    const result = copy.resolve({ ...action, fingerprint: String(n) }, { events: [] });
    assert.equal(result.actionLabel, 'Retomar estudos');
    assert.equal(result.kicker, 'DE VOLTA AOS ESTUDOS');
    seen.add(result.text);
  }
  assert.equal(seen.size, 6);
});
const fs = require('node:fs'), vm = require('node:vm');
test('event reminder wins; inactivity alone reaches Home and supports dismissal', () => {
  const scope = { console, Date, studyEvidence: evidence }; vm.createContext(scope);
  for (const name of ['context-intelligence', 'contextual-copy', 'context-delivery']) vm.runInContext(fs.readFileSync(`js/${name}.js`, 'utf8'), scope);
  const data = input(), source = { now: new Date(now).toISOString(), user: { id: 'u' }, events: [], dedication: { state: data.state, songs: data.songs } };
  const result = scope.roudyContextIntelligence.evaluate(source);
  assert.equal(result.nextBestAction.actionType, 'RESUME_AFTER_INACTIVITY');
  assert.equal(scope.contextDelivery.select(result.nextBestAction).surface, 'HOME');
  assert.equal(scope.roudyContextIntelligence.evaluate(source, { acknowledgedFingerprints: [result.nextBestAction.fingerprint] }).nextBestAction.actionType, 'NONE');
  const event = { id: 'e', title: 'Evento', date: '2026-11-23', time: '12:00', members: [{ id: 'u' }], repertoire: [{ id: 'i', songId: 's' }] };
  const withEvent = scope.roudyContextIntelligence.evaluate({ ...source, events: [event] });
  assert.equal(withEvent.nextBestAction.actionType, 'OPEN_UPCOMING_EVENT');
  assert.equal(withEvent.snapshot.events[0].preparation.state, 'UNKNOWN');
});
test('dismissal is account-scoped and stays local without requiring an event', () => {
  let stored = {}; const scope = { storage: { get: () => stored, set: (_key, value) => stored = value } }; vm.createContext(scope);
  vm.runInContext(fs.readFileSync('js/context-acknowledgements.js', 'utf8'), scope);
  const action = evidence.inactivityCandidate(input());
  const record = scope.contextAcknowledgements.acknowledgeLocal(action, 'u');
  assert.equal(record.syncState, 'local');
  assert.equal(scope.contextAcknowledgements.fingerprints('u')[0], action.fingerprint);
  assert.equal(scope.contextAcknowledgements.fingerprints('other').length, 0);
});
