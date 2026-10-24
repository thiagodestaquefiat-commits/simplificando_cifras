// MANUTENÇÃO: Histórico local e leve do card contextual. Não cria notificações nem telemetria remota.
(function (global) {
  'use strict';

  const STORAGE_KEY = 'sc_context_history_v1';
  const MAX_RECORDS_PER_USER = 120;
  function text(value) { return String(value == null ? '' : value).trim(); }
  function root() { const value = global.storage.get(STORAGE_KEY, {}); return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
  function userKey(userId) { return text(userId) || 'guest'; }
  function list(userId) { const values = root()[userKey(userId)]; return Array.isArray(values) ? values.slice() : []; }
  function write(userId, records) {
    const values = root(); values[userKey(userId)] = records.slice(-MAX_RECORDS_PER_USER); global.storage.set(STORAGE_KEY, values);
    return values[userKey(userId)];
  }
  function record(action, userId, state, at, editorial) {
    const fingerprint = text(action && action.fingerprint); if (!fingerprint) return null;
    const records = list(userId), index = records.findIndex(value => value.fingerprint === fingerprint), previous = index >= 0 ? records[index] : {};
    const timestamp = at || new Date().toISOString(), next = {
      ...previous, fingerprint, eventId: text(action.eventId), actionType: text(action.actionType), category: text(action.category),
      firstPresentedAt: previous.firstPresentedAt || (state === 'presented' ? timestamp : null),
      presentedAt: state === 'presented' ? timestamp : previous.presentedAt || null,
      openedAt: state === 'opened' ? timestamp : previous.openedAt || null,
      presentationCount: Number(previous.presentationCount || 0) + (state === 'presented' ? 1 : 0),
      variantId: text(editorial && editorial.variantId) || previous.variantId || null,
      editorialFamily: text(editorial && editorial.editorialFamily) || previous.editorialFamily || null,
      editorialStructure: text(editorial && editorial.editorialStructure) || previous.editorialStructure || null,
      intensity: text(editorial && editorial.intensity) || previous.intensity || null
    };
    if (index >= 0) records.splice(index, 1); records.push(next); write(userId, records); return next;
  }
  function presented(action, userId, at, editorial) { return record(action, userId, 'presented', at, editorial); }
  function opened(action, userId, at) { return record(action, userId, 'opened', at); }

  global.contextHistory = Object.freeze({ STORAGE_KEY, list, presented, opened });
  if (typeof module !== 'undefined' && module.exports) module.exports = global.contextHistory;
})(typeof window !== 'undefined' ? window : globalThis);
