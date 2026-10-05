const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const { TextEncoder, TextDecoder } = require('node:util');

const values = new Map();
const calls = [];
const context = {
  console, crypto: webcrypto, TextEncoder, TextDecoder, setTimeout, clearTimeout,
  storage: { get: (key, fallback) => values.has(key) ? structuredClone(values.get(key)) : fallback, set: (key, value) => (values.set(key, structuredClone(value)), true) },
  eventCollaboration: { async markSongAsReviewed(receipt) { calls.push(structuredClone(receipt)); return { receipt: { ...receipt, id: 'server-receipt', syncState: undefined } }; } }
};
context.window = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync('js/event-model.js', 'utf8'), context);
vm.runInContext(fs.readFileSync('js/preparation-receipts.js', 'utf8'), context);

function event(id = 'event-a', userId = 'user-a') {
  return context.eventModel.create({ id, title: 'Culto', bandId: id === 'event-a' ? 'band-a' : 'band-b', leaderId: userId,
    members: [{ id: userId, name: userId, role: 'Guitarra' }],
    repertoire: [{ id: `item-${id}`, songId: 'song-1', shared: { key: 'G', capo: '0', chordSheet: 'G C D', notes: 'Suave' } }] });
}

(async () => {
  const first = await context.preparationReceipts.markLocal({ userId: 'user-a', event: event(), itemId: 'item-event-a', reviewedAt: '2026-10-05T12:00:00Z' });
  const repeated = await context.preparationReceipts.markLocal({ userId: 'user-a', event: event(), itemId: 'item-event-a', reviewedAt: '2026-10-05T13:00:00Z' });
  assert.equal(repeated.clientReceiptId, first.clientReceiptId, 'mesma versão é idempotente localmente');
  assert.equal(repeated.reviewedAt, first.reviewedAt, 'retry preserva reviewedAt');
  const otherUser = await context.preparationReceipts.markLocal({ userId: 'user-b', event: event('event-a', 'user-b'), itemId: 'item-event-a' });
  const otherEvent = await context.preparationReceipts.markLocal({ userId: 'user-a', event: event('event-b'), itemId: 'item-event-b' });
  assert.notEqual(otherUser.clientReceiptId, first.clientReceiptId, 'músicos independentes');
  assert.notEqual(otherEvent.clientReceiptId, first.clientReceiptId, 'eventos independentes');
  assert.equal(context.preparationReceipts.list('user-a').length, 2);
  const synced = await context.preparationReceipts.flush('user-a', { id: 'user-a' });
  assert.equal(synced.length, 2, 'fila offline sincronizada');
  await context.preparationReceipts.flush('user-a', { id: 'user-a' });
  assert.equal(calls.length, 2, 'sync duplicado não duplica receipt');
  const changedEvent = event();changedEvent.repertoire[0].shared.key = 'A';
  const changed = await context.preparationReceipts.markLocal({ userId: 'user-a', event: changedEvent, itemId: 'item-event-a' });
  assert.notEqual(changed.reviewedRevision, first.reviewedRevision, 'mudança relevante gera revisão nova');
  await assert.rejects(() => context.preparationReceipts.markLocal({ userId: 'outsider', event: event(), itemId: 'item-event-a' }), /Somente integrantes/);
  console.log('preparation-receipts.test.js: OK');
})().catch(error => { console.error(error); process.exitCode = 1; });
