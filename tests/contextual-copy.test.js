const assert = require('node:assert/strict');
const copy = require('../js/contextual-copy.js');

const events = [{ id: 'event-1', title: 'Culto de Domingo', repertoire: [{ id: 'item-1', shared: { title: 'A Alegria' } }] }];
const action = (actionType, extra = {}) => ({ actionType, eventId: 'event-1', fingerprint: `${actionType}:stable`, destination: { view: 'event', eventId: 'event-1' }, ...extra, evidence: { eventPhase: 'APPROACHING', ...extra.evidence } });

assert.equal(copy.resolve({ actionType: 'NONE' }, { events }), null, 'NONE permanece silencioso');

const review = action('REVIEW_CHANGED_SONG', { repertoireItemId: 'item-1', destination: { view: 'song' }, evidence: { evidenceIncomplete: true, relevantChanges: [{ type: 'KEY_CHANGED', before: 'G', after: 'A' }] } });
const reviewCopy = copy.resolve(review, { events });
assert.match(reviewCopy.text, /A Alegria/);
assert.doesNotMatch(reviewCopy.text, /mudou de G para A/, 'evidência incompleta não usa before/after');

const reliableReview = action('REVIEW_CHANGED_SONG', { repertoireItemId: 'item-1', fingerprint: 'review:key', destination: { view: 'song' }, evidence: { evidenceIncomplete: false, relevantChanges: [{ type: 'KEY_CHANGED', before: 'G', after: 'A' }] } });
assert.match(copy.resolve(reliableReview, { events }).text, /mudou de G para A/);

const start = copy.resolve(action('START_PREPARATION', { evidence: { pendingCount: 4 } }), { events });
assert.match(start.text, /Culto de Domingo/);
assert.match(start.text, /4 músicas/);

const singular = copy.resolve(action('CONTINUE_PREPARATION', { fingerprint: 'continue:one', evidence: { pendingCount: 1 } }), { events });
assert.match(singular.text, /(1|uma) música/);
assert.doesNotMatch(singular.text, /Faltam 1|músicas/);
assert.match(singular.text, /Sempre tem uma/);
const plural = copy.resolve(action('CONTINUE_PREPARATION', { fingerprint: 'continue:two', evidence: { pendingCount: 2 } }), { events });
assert.match(plural.text, /2 músicas/);

const twoPending = copy.resolve(action('CONTINUE_PREPARATION', { fingerprint: 'continue:two:trusted', evidence: { pendingCount: 2, readyCount: 4, totalCount: 6, changedCount: 0 } }), { events });
assert.match(twoPending.text, /4 de 6 músicas revisadas\. As outras duas sabem quem são/);
const unknownCount = copy.resolve(action('START_PREPARATION', { fingerprint: 'start:unknown', evidence: {} }), { events });
assert.doesNotMatch(unknownCount.text, /\b0\b|Falta|Faltam|músicas dando sopa/);

const stage = copy.resolve(action('ENTER_STAGE_MODE', { evidence: { eventPhase: 'TODAY', state: 'READY' } }), { events });
assert.equal(stage.actionLabel, 'Modo Palco');
assert.match(stage.text, /palco|tocar|ensaio|fechar o app|sem assunto/i);
assert.ok(['ENTER_STAGE_MODE.today'].some(prefix => stage.variantId.startsWith(prefix)), 'finalização exige NBA de palco e estado pronto');
assert.equal(copy.resolve(action('ENTER_STAGE_MODE', { fingerprint: 'stage:not-ready', evidence: { eventPhase: 'TODAY', state: 'IN_PROGRESS' } }), { events }), null, 'copy de finalização exige READY comprovado');
const notReady = copy.resolve(action('START_PREPARATION', { fingerprint: 'not-ready', evidence: { pendingCount: 2, eventPhase: 'TODAY' } }), { events });
assert.doesNotMatch(notReady.text, /Tudo preparado|Repertório inteiro revisado|ROUDY oficialmente sem assunto|Tudo certo por aqui/);

let keyHumor = null;
for (let index = 0; index < 100 && !keyHumor; index += 1) {
  const candidate = copy.resolve(action('REVIEW_CHANGED_SONG', { repertoireItemId: 'item-1', fingerprint: `key-humor-${index}`, destination: { view: 'song' }, evidence: { evidenceIncomplete: false, relevantChanges: [{ type: 'KEY_CHANGED', before: 'F', after: 'G' }] } }), { events });
  if (/Melhor descobrir aqui/.test(candidate.text)) keyHumor = candidate;
}
assert.ok(keyHumor, 'KEY_CHANGED confiável pode usar humor específico');
assert.match(keyHumor.text, /tom mudou para G/);
const keyWithoutAfter = copy.resolve(action('REVIEW_CHANGED_SONG', { repertoireItemId: 'item-1', fingerprint: 'key-missing-after', evidence: { evidenceIncomplete: false, relevantChanges: [{ type: 'KEY_CHANGED', before: 'F', after: null }] } }), { events });
assert.doesNotMatch(keyWithoutAfter.text, /Melhor descobrir aqui|mudou de F/);

const addedWithoutDeliveryEvidence = copy.resolve(action('REVIEW_CHANGED_SONG', { repertoireItemId: 'item-1', fingerprint: 'song-added', evidence: { evidenceIncomplete: false, relevantChanges: [{ type: 'SONG_ADDED', after: { songId: 'song-2' } }] } }), { events });
assert.doesNotMatch(addedWithoutDeliveryEvidence.text, /Música nova|adicionou música|em cima da hora/, 'SONG_ADDED não é afirmado sem NBA compatível');
const addedNeutral = copy.resolve(action('START_PREPARATION', { fingerprint: 'added-neutral', evidence: { eventPhase: 'UNKNOWN', pendingCount: 1, relevantChanges: [{ type: 'SONG_ADDED', changedAt: null, hoursBeforeEvent: null }] } }), { events });
assert.equal(addedNeutral.text, 'Música nova no repertório.');
const addedFuture = copy.resolve(action('CONTINUE_PREPARATION', { fingerprint: 'added-future', evidence: { eventPhase: 'PREPARATION', hoursUntil: 72, pendingCount: 1, relevantChanges: [{ type: 'SONG_ADDED', changedAt: '2026-10-01T12:00:00Z', hoursBeforeEvent: 120 }] } }), { events });
assert.equal(addedFuture.text, 'Música nova no repertório. Respira. Ainda dá tempo.');
const addedLastMinute = copy.resolve(action('CONTINUE_PREPARATION', { fingerprint: 'added-last-minute', evidence: { eventPhase: 'APPROACHING', hoursUntil: 18, pendingCount: 1, relevantChanges: [{ type: 'SONG_ADDED', changedAt: '2026-10-05T15:00:00Z', hoursBeforeEvent: 18 }] } }), { events });
assert.equal(addedLastMinute.text, 'O repertório mudou. Sim, alguém adicionou música em cima da hora.');
const addedDaysAgoTomorrow = copy.resolve(action('START_PREPARATION', { fingerprint: 'added-days-ago', evidence: { eventPhase: 'APPROACHING', hoursUntil: 18, pendingCount: 1, relevantChanges: [{ type: 'SONG_ADDED', changedAt: '2026-10-01T12:00:00Z', hoursBeforeEvent: 120 }] } }), { events });
assert.notEqual(addedDaysAgoTomorrow.text, 'O repertório mudou. Sim, alguém adicionou música em cima da hora.');
const addedPast = copy.resolve(action('START_PREPARATION', { fingerprint: 'added-past', evidence: { eventPhase: 'PAST', hoursUntil: -2, pendingCount: 1, relevantChanges: [{ type: 'SONG_ADDED', changedAt: '2026-10-05T15:00:00Z', hoursBeforeEvent: 18 }] } }), { events });
assert.equal(addedPast.text, 'Música nova no repertório.');
assert.doesNotMatch(addedPast.text, /Ainda dá tempo/);
const pendingOnly = copy.resolve(action('START_PREPARATION', { fingerprint: 'pending-only', evidence: { eventPhase: 'APPROACHING', hoursUntil: 18, pendingCount: 2 } }), { events });
assert.doesNotMatch(pendingOnly.text, /Música nova|adicionou música/);
const notToday = copy.resolve(action('START_PREPARATION', { fingerprint: 'not-today', evidence: { eventPhase: 'PREPARATION', pendingCount: 3 } }), { events });
assert.doesNotMatch(notToday.text, /É hoje|Evento amanhã|em cima da hora/);
const tomorrow = copy.resolve(action('START_PREPARATION', { fingerprint: 'tomorrow', evidence: { eventPhase: 'APPROACHING', hoursUntil: 18, pendingCount: 3 } }), { events });
assert.match(tomorrow.text, /Evento amanhã\. Nada de descobrir o tom no palco/);
const approachingWithoutReliableHours = copy.resolve(action('START_PREPARATION', { fingerprint: 'approaching-unknown', evidence: { eventPhase: 'APPROACHING', pendingCount: 3 } }), { events });
assert.doesNotMatch(approachingWithoutReliableHours.text, /Evento amanhã/);
const today = copy.resolve(action('START_PREPARATION', { fingerprint: 'today', evidence: { eventPhase: 'TODAY', pendingCount: 3 } }), { events });
assert.match(today.variantId, /\.today\./);

const stableA = copy.resolve(action('CONTINUE_PREPARATION', { fingerprint: 'same-fingerprint', evidence: { pendingCount: 3 } }), { events });
const stableB = copy.resolve(action('CONTINUE_PREPARATION', { fingerprint: 'same-fingerprint', evidence: { pendingCount: 3 } }), { events });
assert.equal(stableA.variantId, stableB.variantId);
assert.equal(stableA.text, stableB.text, 're-render mantém a mesma frase');

let alternative = null;
for (let index = 0; index < 100 && !alternative; index += 1) {
  const candidate = copy.resolve(action('CONTINUE_PREPARATION', { fingerprint: `different-${index}`, evidence: { pendingCount: 3 } }), { events });
  if (candidate.variantId !== stableA.variantId) alternative = candidate;
}
assert.ok(alternative, 'fingerprints diferentes podem escolher variantes diferentes');

const incomplete = copy.resolve(action('START_PREPARATION', { eventId: 'missing', fingerprint: 'missing', evidence: {} }), { events });
assert.doesNotMatch(incomplete.text, /undefined|null|\[object Object\]|0 músicas/);

const destination = { view: 'event', eventId: 'event-1' };
const immutableAction = action('START_PREPARATION', { destination, evidence: { pendingCount: 2 } });
copy.resolve(immutableAction, { events });
assert.deepEqual(immutableAction.destination, destination, 'copy não altera destination');
assert.equal(copy.resolve(immutableAction, { events }).usedLlm, false);
assert.equal(global.contextAcknowledgements, undefined, 'resolver não cria acknowledgement');
assert.equal(global.preparationReceipts, undefined, 'resolver não cria receipt');
assert.doesNotMatch(require('node:fs').readFileSync('js/contextual-copy.js', 'utf8'), /fetch\(|XMLHttpRequest|WebSocket|Math\.random|openai|prompt/i, 'copy é local, offline e determinística');
const activeCatalog = JSON.stringify(copy.CATALOG);
assert.doesNotMatch(activeCatalog, /ansiedade|Nenhuma música revisada|A casa já é praticamente sua|Esse refrão já entendeu|Perfeccionismo ou carinho|Bom dia|Faltam 3 dias/, 'frases sem evidência ou em revisão editorial ficam fora do runtime');

console.log('contextual-copy.test.js: OK');
