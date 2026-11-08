const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs'), vm = require('node:vm');
const evidence = require('../js/study-evidence.js');
const DAY = 86400000, HOUR = 3600000;
function memoryStore() {
  const values = new Map(); let queue = Promise.resolve();
  return { values, update(owner, edit) { const next = queue.then(() => { const value = edit(structuredClone(values.get(owner) || { userId: owner, enabled: true, epoch: 0, sessions: [], lastPresentedAt: null, reservation: null })); values.set(owner, structuredClone(value)); return structuredClone(value); }); queue = next.catch(() => {}); return next; } };
}
async function fixture(config = {}) {
  let at = Date.parse('2026-11-04T12:00:00Z'); const store = memoryStore();
  const tracker = evidence.create({ store, config, now: () => at }); await tracker.useUser('u1');
  const context = { userId: 'u1', songId: 'A', songKey: 'A', timeZone: 'America/Sao_Paulo' };
  const tick = ms => at += ms;
  async function loop(extra = {}, target = tracker) {
    target.begin({ ...context, ...extra }); target.armLoop({ start: 0, end: 20, deliberate: true });
    for (let n = 0; n < 3; n++) { tick(20000); await target.loopPass({ start: 0, end: 20, seconds: 20, complete: true }); }
    await target.end(); await target.flush();
  }
  function candidates(extra = {}) { return evidence.candidates({ state: tracker.snapshot(), userId: 'u1', now: at, songs: [{ id: 'A', title: 'Música A' }, { id: 'B', title: 'Música B' }], timeZone: 'America/Sao_Paulo', ...extra }, config); }
  return { tracker, store, tick, loop, context, candidates, now: () => at, set: value => at = value };
}
test('contact and a static screen never qualify, regardless of elapsed time', async () => {
  const f = await fixture(); f.tracker.begin(f.context); f.tick(15 * 60000); await f.tracker.end(); assert.equal(f.tracker.snapshot().sessions.length, 0); assert.deepEqual(f.candidates(), []);
});
test('one deliberate sustained loop path qualifies after three full passes and 60 seconds', async () => {
  const f = await fixture(); await f.loop(); const records = f.tracker.snapshot().sessions; assert.equal(records.length, 1); assert.equal(records[0].path, 'loop'); assert.deepEqual(f.candidates(), []);
});
test('automatic loop restoration and incomplete passages do not qualify', async () => {
  const f = await fixture(); f.tracker.begin(f.context);
  for (const deliberate of [false, true]) {
    f.tracker.armLoop({ start: 0, end: 20, deliberate });
    for (let n = 0; n < 10; n++) await f.tracker.loopPass({ start: 0, end: 20, seconds: 3, complete: deliberate });
  }
  await f.tracker.end(); assert.equal(f.tracker.snapshot().sessions.length, 0);
});
function feed(observer, start, end, offset = 0, extra = {}) {
  let result; for (let p = start; p <= end + .0001; p += .1) result = observer.sample({ position: p, at: offset + (p - start) * 1000, playing: true, visible: true, ...extra }) || result; return result;
}
test('loop observer rejects buffering, hidden playback, manual seeks and long polling gaps', () => {
  const bounds = { start: 10, end: 30, deliberate: true }, observer = evidence.createLoopObserver();
  observer.arm(bounds); assert.equal(feed(observer, 10, 30, 0, { playing: false }), undefined);
  observer.arm(bounds); assert.equal(feed(observer, 10, 30, 0, { visible: false }), undefined);
  observer.arm(bounds); observer.sample({ position: 10, at: 0, playing: true, visible: true }); assert.equal(observer.sample({ position: 29.95, at: 100, playing: true, visible: true }), null);
  observer.arm(bounds); observer.sample({ position: 10, at: 0, playing: true, visible: true }); assert.equal(observer.sample({ position: 30, at: 20000, playing: true, visible: true }), null);
  observer.arm(bounds); const valid = feed(observer, 10, 30); assert.equal(valid.complete, true); assert.ok(valid.seconds >= 19.9);
});
test('pausing in the middle invalidates that passage but later complete passages work', () => {
  const observer = evidence.createLoopObserver(); observer.arm({ start: 0, end: 20, deliberate: true });
  feed(observer, 0, 8); observer.sample({ position: 8, at: 8100, playing: false, visible: true }); assert.equal(feed(observer, 8, 20, 9000), undefined); assert.equal(feed(observer, 0, 20, 30000).complete, true);
});
test('real block edits separated by 30 seconds and saved qualify; content is never persisted', async () => {
  const f = await fixture(); f.tracker.begin(f.context); f.tracker.editStart(); f.tracker.editInput(); f.tick(30000); f.tracker.editInput(); await f.tracker.editSaved(true); await f.tracker.end();
  assert.equal(f.tracker.snapshot().sessions[0].path, 'block'); assert.doesNotMatch(JSON.stringify(f.tracker.snapshot()), /lyrics|chords|audio|position|keystroke|regions|editInput/);
});
test('cancel, unchanged save and a single editing moment never qualify', async () => {
  const f = await fixture();
  for (const mode of ['cancel', 'unchanged', 'single']) {
    f.tracker.begin(f.context); f.tracker.editStart(); f.tracker.editInput(); f.tick(30000);
    if (mode !== 'single') f.tracker.editInput();
    if (mode === 'cancel') f.tracker.cancelEdit(); else await f.tracker.editSaved(mode !== 'unchanged');
    await f.tracker.end();
  }
  assert.equal(f.tracker.snapshot().sessions.length, 0);
});
test('two meaningful distinct regions over 90 seconds qualify without constant interaction', async () => {
  const f = await fixture(); f.tracker.begin(f.context); await f.tracker.reading('intro', true); f.tick(15 * 60000); await f.tracker.reading('ponte', true); await f.tracker.end(); assert.equal(f.tracker.snapshot().sessions[0].path, 'reading');
});
test('programmatic scroll, repeated same region and brief control exploration do not qualify', async () => {
  const f = await fixture(); f.tracker.begin(f.context);
  for (let n = 0; n < 5; n++) { f.tick(30000); await f.tracker.reading('same', true); await f.tracker.reading('automatic-' + n, false); }
  await f.tracker.end(); assert.equal(f.tracker.snapshot().sessions.length, 0);
});
test('two distinct sessions in the same day generate song dedication but not daily consistency', async () => {
  const f = await fixture(); await f.loop(); f.tick(HOUR); await f.loop();
  const actions = f.candidates(); assert.ok(actions.some(a => a.actionType === evidence.ACTIONS[0])); assert.ok(!actions.some(a => a.actionType === evidence.ACTIONS[1]));
});
test('two different days support consistency with no consecutive-day requirement', async () => {
  const f = await fixture(); await f.loop(); f.tick(3 * DAY); await f.loop({ songId: 'B', songKey: 'B' }); assert.ok(f.candidates().some(a => a.actionType === evidence.ACTIONS[1]));
});
test('two songs in the current accessible event support repertoire dedication on the same day', async () => {
  const f = await fixture(); await f.loop({ eventId: 'E', itemId: 'iA' }); await f.loop({ songId: 'B', songKey: 'B', eventId: 'E', itemId: 'iB' });
  const event = { id: 'E', phase: 'FAR', repertoire: [{ id: 'iA', songId: 'A' }, { id: 'iB', songId: 'B' }] };
  assert.ok(f.candidates({ events: [event] }).some(a => a.actionType === evidence.ACTIONS[2]));
  event.repertoire[0].accessible = false; assert.ok(!f.candidates({ events: [event] }).some(a => a.actionType === evidence.ACTIONS[2]));
  event.repertoire[0].accessible = true; event.repertoire[0].updatedAt = 'changed'; assert.ok(!f.candidates({ events: [event] }).some(a => a.actionType === evidence.ACTIONS[2]));
});
test('rapid reopen/reload and simultaneous writers coalesce into one qualified record', async () => {
  const f = await fixture(); await f.loop(); f.tick(40000); await f.loop(); assert.equal(f.tracker.snapshot().sessions.length, 1);
  const other = evidence.create({ store: f.store, now: f.now }); await other.useUser('u1'); await f.loop({}, other); await f.tracker.refresh(); assert.equal(f.tracker.snapshot().sessions.length, 1);
  f.tick(HOUR); await Promise.all([f.loop(), f.loop({}, other)]); await f.tracker.refresh(); assert.equal(f.tracker.snapshot().sessions.length, 2);
});
test('continuous practice never splits on time alone and crossing midnight contributes one day', async () => {
  const f = await fixture(); f.set(Date.parse('2026-11-05T02:59:30Z')); f.tracker.begin(f.context); f.tracker.armLoop({ start: 0, end: 20, deliberate: true });
  for (let n = 0; n < 6; n++) { f.tick(20000); await f.tracker.loopPass({ start: 0, end: 20, seconds: 20, complete: true }); }
  f.tick(HOUR); await f.tracker.loopPass({ start: 0, end: 20, seconds: 20, complete: true }); await f.tracker.end();
  assert.equal(f.tracker.snapshot().sessions.length, 1); assert.equal(f.tracker.snapshot().sessions[0].localDay, '2026-11-05'); assert.ok(!f.candidates().some(a => a.actionType === evidence.ACTIONS[1]));
});
test('retention, configured cap, identity isolation, disabled preference and deletion', async () => {
  const f = await fixture({ maxSessions: 3 }); for (let n = 0; n < 5; n++) { await f.loop(); f.tick(HOUR); } assert.equal(f.tracker.snapshot().sessions.length, 3);
  await f.tracker.setEnabled(false); await f.loop(); assert.equal(f.tracker.snapshot().sessions.length, 3);
  await f.tracker.useUser('u2'); assert.equal(f.tracker.snapshot().enabled, true); assert.equal(f.tracker.snapshot().sessions.length, 0);
  await f.tracker.useUser('u1'); assert.equal(f.tracker.snapshot().enabled, false); await f.tracker.clear(); assert.equal(f.tracker.snapshot().enabled, false); assert.equal(f.tracker.snapshot().sessions.length, 0);
  await f.tracker.setEnabled(true); await f.loop(); f.tick(91 * DAY); await f.tracker.refresh(); assert.equal(f.tracker.snapshot().sessions.length, 0);
});
test('storage failure degrades to no recognition without throwing or interrupting controls', async () => {
  const tracker = evidence.create({ store: { update() { throw new Error('quota'); } } }); await tracker.useUser('u'); assert.equal(tracker.begin({ userId: 'u', songKey: 'A' }), null); await tracker.reading('region', true); await tracker.end(); assert.equal(tracker.snapshot(), null); assert.equal(tracker.available(), false);
});
test('reserving/deferring does not consume; actual presentation consumes shared evidence once', async () => {
  const f = await fixture(); await f.loop(); f.tick(DAY); await f.loop(); const actions = f.candidates(); assert.equal(actions.length, 2);
  const grant = await f.tracker.reserve(actions[0]); assert.ok(grant); assert.ok(f.candidates().length);
  assert.equal(await f.tracker.consume(actions[0], grant, () => false), false); await f.tracker.release(grant);
  const next = await f.tracker.reserve(actions[0]); assert.equal(await f.tracker.consume(actions[0], next, () => true), true); assert.deepEqual(f.candidates(), []);
  f.tick(4 * DAY); assert.deepEqual(f.candidates(), [], 'cooldown ending cannot recreate the same achievement');
  await f.loop(); f.tick(HOUR); await f.loop(); assert.ok(f.candidates().length, 'new evidence can support a later recognition');
});
test('72-hour global limit spans all recognition types, including across tracker instances', async () => {
  const f = await fixture(); await f.loop(); f.tick(HOUR); await f.loop(); const action = f.candidates()[0], grant = await f.tracker.reserve(action); await f.tracker.consume(action, grant, () => true);
  f.tick(HOUR); await f.loop({ songId: 'B', songKey: 'B' }); f.tick(DAY); await f.loop({ songId: 'B', songKey: 'B' }); assert.deepEqual(f.candidates(), []);
  f.tick(3 * DAY); assert.ok(f.candidates().length);
  const other = evidence.create({ store: f.store, now: f.now }); await other.useUser('u1'); const a = f.candidates()[0]; const claims = await Promise.all([f.tracker.reserve(a), other.reserve(a)]); assert.equal(claims.filter(Boolean).length, 1);
});
test('matching titles never joins different song identities and old records cannot make a claim', async () => {
  const f = await fixture(); await f.loop(); f.tick(HOUR); await f.loop({ songId: 'B', songKey: 'B' }); assert.deepEqual(f.candidates({ songs: [{ id: 'A', title: 'Same' }, { id: 'B', title: 'Same' }] }), []);
  f.tick(15 * DAY); assert.deepEqual(f.candidates(), []);
});
test('existing contextual engine prioritizes operational actions; only dedication may use LOW fallback', async () => {
  const f = await fixture(); await f.loop(); f.tick(HOUR); await f.loop();
  const context = { Date, Intl, console, studyEvidence: evidence }; vm.createContext(context); vm.runInContext(fs.readFileSync('js/context-intelligence.js', 'utf8'), context);
  const input = { now: new Date(f.now()).toISOString(), user: { id: 'u1' }, events: [], dedication: { state: f.tracker.snapshot(), songs: [{ id: 'A', title: 'Song A' }] } };
  assert.equal(context.roudyContextIntelligence.evaluate(input).nextBestAction.actionType, evidence.ACTIONS[0]);
  input.events = [{ id: 'E', date: new Date(f.now()).toISOString().slice(0, 10), time: '20:00', members: [{ id: 'u1' }], repertoire: [{ id: 'iA', songId: 'A' }], changes: [{ id: 'change', type: 'KEY_CHANGED', songId: 'A', timestamp: new Date(f.now() - 1000).toISOString(), before: 'C', after: 'D', actorId: 'other' }] }];
  const selected = context.roudyContextIntelligence.evaluate(input).nextBestAction; assert.equal(selected.actionType, 'CHECK_EVENT_CHANGES'); assert.equal(f.tracker.snapshot().sessions.filter(s => s.consumedAt).length, 0);
  assert.equal(context.roudyContextIntelligence.evaluate({ ...input, events: [], dedication: null }).nextBestAction.actionType, 'NONE');
  assert.equal(context.roudyContextIntelligence.evaluate({ ...input, user: { id: 'other' }, events: [] }).nextBestAction.actionType, 'NONE');
});
test('dedication copy is evidence-gated, deterministic and never claims mastery or a practice count', async () => {
  const f = await fixture(); await f.loop(); f.tick(DAY); await f.loop();
  const context = { console }; vm.createContext(context); vm.runInContext(fs.readFileSync('js/contextual-copy.js', 'utf8'), context);
  for (const a of f.candidates()) {
    const left = context.contextualCopy.resolve(a, { history: [], events: [] }), right = context.contextualCopy.resolve(a, { history: [], events: [] });
    assert.equal(left.text, right.text); assert.doesNotMatch(left.text, /dominou|aprendeu|\d+\s*(vezes|ensaios|minutos)|faltou|ausência/i); assert.equal(left.usedLlm, false);
    assert.equal(context.contextualCopy.resolve({ ...a, evidence: {} }, { history: [], events: [] }), null);
  }
});
