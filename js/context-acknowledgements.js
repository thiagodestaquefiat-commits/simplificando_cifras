(function (global) {
  'use strict';
  const STORAGE_KEY = 'sc_context_acknowledgements_v1';
  let hydratedUser = null, hydration = null;
  function text(value) { return String(value == null ? '' : value).trim(); }
  function root() { const value = global.storage.get(STORAGE_KEY, {}); return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
  function key(userId, fingerprint) { return `${text(userId)}:${text(fingerprint)}`; }
  function list(userId) { return Object.values(root()).filter(value => text(value.userId) === text(userId)); }
  function fingerprints(userId) { return list(userId).map(value => value.fingerprint); }
  function reconcile(remote) {
    if (!remote || !remote.userId || !remote.fingerprint) return null;
    const values = root(), id = key(remote.userId, remote.fingerprint), local = values[id];
    values[id] = { ...local, ...remote, syncState: 'synced' }; global.storage.set(STORAGE_KEY, values); return values[id];
  }
  function acknowledgeLocal(action, userId, acknowledgedAt) {
    if (!action || action.actionType === 'NONE' || !action.fingerprint || !action.eventId) throw new Error('A ação contextual não pode ser reconhecida.');
    const values = root(), id = key(userId, action.fingerprint);
    if (values[id]) return values[id];
    values[id] = { userId: text(userId), fingerprint: action.fingerprint, eventId: action.eventId, actionType: action.actionType, acknowledgedAt: acknowledgedAt || new Date().toISOString(), syncState: 'pending' };
    global.storage.set(STORAGE_KEY, values); return values[id];
  }
  async function syncOne(value) {
    const response = await global.eventCollaboration.acknowledgeContextAction(value);
    return reconcile(response.acknowledgement);
  }
  async function flush(userId) {
    const completed = [];
    for (const value of list(userId).filter(item => item.syncState === 'pending')) completed.push(await syncOne(value));
    return completed;
  }
  async function hydrate(userId) {
    const id = text(userId); if (!id) return list(id);
    if (hydratedUser === id && hydration) return hydration;
    hydratedUser = id;
    hydration = (async () => {
      try { const remote = await global.eventCollaboration.listContextAcknowledgements(); (remote.acknowledgements || []).forEach(reconcile); await flush(id); }
      catch (_) { /* O contexto local confiável continua disponível offline. */ }
      return list(id);
    })();
    return hydration;
  }
  function resetHydration() { hydratedUser = null; hydration = null; }

  global.contextAcknowledgements = Object.freeze({ STORAGE_KEY, list, fingerprints, reconcile, acknowledgeLocal, syncOne, flush, hydrate, resetHydration });
})(typeof window !== 'undefined' ? window : globalThis);
