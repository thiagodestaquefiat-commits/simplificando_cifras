(function (global) {
  'use strict';

  const STORAGE_KEY = 'sc_song_review_receipts_v1';

  function text(value) { return String(value == null ? '' : value); }
  function stable(value) {
    if (Array.isArray(value)) return value.map(stable);
    if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
    return value;
  }
  function canonical(value) { return JSON.stringify(stable(value)); }
  async function sha256(value) {
    const bytes = new TextEncoder().encode(value);
    const digest = await global.crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  }
  async function contentIdentity(value) {
    const content = text(value);
    return { sha256: await sha256(content), length: content.length };
  }
  function contextKey(userId, eventId, itemId) { return [userId, eventId, itemId].map(text).join(':'); }
  function root() { const value = global.storage.get(STORAGE_KEY, {}); return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
  function findItem(event, itemId) { return (event.repertoire || []).find(item => text(item.id) === text(itemId)); }
  function personalFor(item, userId) { return item.personalEdits && item.personalEdits[text(userId)] || null; }
  function effective(personal, shared) { return personal !== undefined && personal !== null && personal !== '' ? personal : (shared || ''); }
  async function revision(event, item, userId) {
    const personal = personalFor(item, userId), shared = item.shared || {};
    const payload = {
      schema: 1, eventId: text(event.id), repertoireItemId: text(item.id), songId: text(item.songId),
      context: {
        key: effective(personal && personal.key, shared.key),
        capo: effective(personal && personal.capo, shared.capo),
        chordSheet: await contentIdentity(effective(personal && personal.chordSheet, shared.chordSheet)),
        notes: await contentIdentity(effective(personal && personal.notes, shared.notes))
      }
    };
    return { hash: await sha256(canonical(payload)), payload };
  }
  function randomId() {
    const id = global.crypto.randomUUID ? global.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return `review_${id.replace(/[^A-Za-z0-9_.:-]/g, '')}`;
  }
  async function markLocal({ userId, event, itemId, reviewedAt }) {
    if (!global.eventModel.canAccess(event, userId)) throw new Error('Somente integrantes podem confirmar preparação.');
    const item = findItem(event, itemId);if (!item) throw new Error('A música não pertence a este evento.');
    const current = await revision(event, item, userId), values = root(), key = contextKey(userId, event.id, item.id), existing = values[key];
    if (existing && existing.reviewedRevision === current.hash) return existing;
    const receipt = {
      userId: text(userId), eventId: text(event.id), repertoireItemId: text(item.id), songId: text(item.songId),
      bandId: event.bandId || null, reviewedRevision: current.hash, revisionPayload: current.payload,
      reviewedAt: reviewedAt || new Date().toISOString(), clientReceiptId: randomId(), syncState: 'pending'
    };
    values[key] = receipt;global.storage.set(STORAGE_KEY, values);return receipt;
  }
  function list(userId) { return Object.values(root()).filter(receipt => text(receipt.userId) === text(userId)); }
  function reconcile(remote) {
    if (!remote || !remote.userId) return null;
    const values = root(), key = contextKey(remote.userId, remote.eventId, remote.repertoireItemId), local = values[key];
    if (local && local.syncState === 'pending' && local.reviewedRevision !== remote.reviewedRevision) return local;
    values[key] = { ...local, ...remote, syncState: 'synced' };global.storage.set(STORAGE_KEY, values);return values[key];
  }
  async function syncOne(receipt, fallback) {
    try {
      const response = await global.eventCollaboration.markSongAsReviewed(receipt, fallback);
      return reconcile(response.receipt);
    } catch (error) {
      if (error && error.code === 'revisao_desatualizada') {
        const values = root(), key = contextKey(receipt.userId, receipt.eventId, receipt.repertoireItemId);
        values[key] = { ...receipt, syncState: 'stale', currentRevision: error.details && error.details.currentRevision || null };
        global.storage.set(STORAGE_KEY, values);
      }
      throw error;
    }
  }
  async function flush(userId, fallback) {
    const synchronized = [];
    for (const receipt of list(userId).filter(value => value.syncState === 'pending')) synchronized.push(await syncOne(receipt, fallback));
    return synchronized;
  }

  global.preparationReceipts = Object.freeze({ STORAGE_KEY, revision, markLocal, list, reconcile, syncOne, flush });
})(window);
