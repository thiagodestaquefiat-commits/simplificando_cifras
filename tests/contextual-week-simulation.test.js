const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const sandbox = { console, Date }; vm.createContext(sandbox); vm.runInContext(fs.readFileSync('js/context-intelligence.js', 'utf8'), sandbox);
const engine = sandbox.roudyContextIntelligence;
const copy = require('../js/contextual-copy.js');

const user = { id: 'musico-1', name: 'Bia' };
const history = [];
const ready = state => ({ state, reviewedAt: state === 'READY' ? '2026-10-22T10:00:00Z' : null, reviewedRevision: 'r1', currentRevision: 'r1', relevantChanges: [], evidenceIncomplete: false });
const song = (id, title, state = 'UNKNOWN') => ({ id: `item-${id}`, songId: `song-${id}`, order: Number(id), shared: { title, key: 'G' }, preparation: ready(state) });
const event = (id, title, date, repertoire, notifications = []) => ({ id, title, date, time: '19:00', members: [{ id: user.id }], repertoire, notifications });

function run(day, events, activity) {
  const now = `2026-10-${String(day).padStart(2, '0')}T09:00:00-03:00`;
  const result = engine.evaluate({ now, user, events, activity }, { history });
  const action = result.nextBestAction;
  const editorial = copy.resolve(action, { events, history });
  return { now, result, action, editorial };
}
function remember(entry, opened = false) {
  if (!entry.editorial) return;
  history.push({ fingerprint: entry.action.fingerprint, eventId: entry.action.eventId, category: entry.action.category, presentedAt: entry.now, openedAt: opened ? entry.now : null, variantId: entry.editorial.variantId, editorialFamily: entry.editorial.editorialFamily, editorialStructure: entry.editorial.editorialStructure, intensity: entry.editorial.intensity });
}

const baseA = [song('1', 'A Alegria')];
const baseB = [song('3', 'Digno')];
const timeline = [];

const day1 = run(23, [event('evento-a', 'Culto de Quarta', '2026-10-29', baseA), event('evento-b', 'Encontro', '2026-10-30', baseB)]);
assert.equal(day1.action.actionType, 'OPEN_UPCOMING_EVENT');
timeline.push(day1); remember(day1);

// Dia 24: acesso intermitente; nenhuma abertura da Home, logo nenhuma mensagem é gerada.

const added = { id: 'add-2', changeType: 'SONG_ADDED', songId: 'song-2', after: { repertoireItemId: 'item-2' }, createdAt: '2026-10-25T08:00:00-03:00' };
const activity = { eventId: 'evento-a', repertoireItemId: 'item-1', songId: 'song-1', openedAt: '2026-10-25T08:30:00-03:00' };
const day3 = run(25, [event('evento-a', 'Culto de Quarta', '2026-10-29', [song('1', 'A Alegria'), song('2', 'Nova Canção')], [added]), event('evento-b', 'Encontro', '2026-10-30', baseB)], activity);
assert.equal(day3.action.actionType, 'CHECK_EVENT_CHANGES');
assert.ok(day3.result.candidates.some(value => value.actionType === 'CONTINUE_STUDY'), 'continuidade existe, mas perde para a mudança');
timeline.push(day3); remember(day3, true);

const pendingA = [song('1', 'A Alegria', 'NOT_STARTED'), song('2', 'Nova Canção', 'NOT_STARTED')];
const day4 = run(26, [event('evento-a', 'Culto de Quarta', '2026-10-29', pendingA, [added]), event('evento-b', 'Encontro', '2026-10-30', baseB)]);
assert.equal(day4.action.actionType, 'START_PREPARATION');
timeline.push(day4); remember(day4, true);

const keyChange = { id: 'key-3', changeType: 'KEY_CHANGED', songId: 'song-3', before: 'G', after: 'A', createdAt: '2026-10-27T08:15:00-03:00' };
const day5 = run(27, [event('evento-a', 'Culto de Quarta', '2026-10-29', pendingA, [added]), event('evento-b', 'Encontro', '2026-10-30', baseB, [keyChange])]);
assert.equal(day5.action.actionType, 'CHECK_EVENT_CHANGES');
assert.equal(day5.action.eventId, 'evento-b');
timeline.push(day5); remember(day5, true);

const day6 = run(28, [event('evento-a', 'Culto de Quarta', '2026-10-29', [song('1', 'A Alegria', 'READY'), song('2', 'Nova Canção', 'READY')], [added]), event('evento-b', 'Encontro', '2026-10-30', baseB, [keyChange])]);
assert.equal(day6.action.actionType, 'RECOGNIZE_PREPARATION');
timeline.push(day6); remember(day6);

const day7 = run(29, [event('evento-a', 'Culto de Quarta', '2026-10-29', [song('1', 'A Alegria', 'READY'), song('2', 'Nova Canção', 'READY')], [added]), event('evento-b', 'Encontro', '2026-10-30', baseB, [keyChange])]);
assert.equal(day7.action.actionType, 'ENTER_STAGE_MODE');
timeline.push(day7); remember(day7);

for (const entry of timeline) {
  assert.ok(entry.editorial && entry.editorial.text);
  assert.ok(entry.editorial.editorialFamily && entry.editorial.editorialStructure && entry.editorial.intensity);
}

console.log(JSON.stringify(timeline.map(entry => ({
  date: entry.now.slice(0, 10), action: entry.action.actionType, eventId: entry.action.eventId,
  family: entry.editorial.editorialFamily, intensity: entry.editorial.intensity,
  message: entry.editorial.text, cta: entry.editorial.actionLabel,
  competitors: entry.action.diagnostic.competingCandidates.map(value => value.actionType)
})), null, 2));
console.log('contextual-week-simulation.test.js: OK');
