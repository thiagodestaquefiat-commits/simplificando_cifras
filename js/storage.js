(function (global) {
  "use strict";
  let failureCount = 0;
  const listeners = new Set();
  function notifyFailure(operation, error) {
    failureCount += 1;
    const detail = { operation, code: error?.name || "StorageError" };
    listeners.forEach(listener => { try { listener(detail); } catch (_error) {} });
  }

  function get(key, fallback) {
    try {
      const value = global.localStorage.getItem(key);
      return value === null ? fallback : JSON.parse(value);
    } catch (error) {
      console.warn("Não foi possível ler os dados locais:", key, error);
      return fallback;
    }
  }

  function set(key, value) {
    try {
      global.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.error("Não foi possível salvar os dados locais:", key, error);
      notifyFailure("save", error);
      return false;
    }
  }

  function remove(key) {
    try {
      global.localStorage.removeItem(key);
      return true;
    } catch (error) {
      console.error("Não foi possível remover os dados locais:", key, error);
      notifyFailure("remove", error);
      return false;
    }
  }

  // localStorage has no transactions. Restore the previous values if a write fails.
  function setMany(entries) {
    const before = new Map();
    try {
      entries.forEach(([key]) => before.set(key, global.localStorage.getItem(key)));
      entries.forEach(([key, value]) => global.localStorage.setItem(key, JSON.stringify(value)));
      return true;
    } catch (error) {
      before.forEach((value, key) => {
        try { if (value === null) global.localStorage.removeItem(key); else global.localStorage.setItem(key, value); }
        catch (_rollbackError) { console.error("Não foi possível reverter uma gravação local."); }
      });
      notifyFailure("save", error);
      return false;
    }
  }

  function snapshotRaw() {
    const snapshot = {};
    try {
      for (let index = 0; index < global.localStorage.length; index += 1) {
        const key = global.localStorage.key(index);
        if (key !== null) snapshot[key] = global.localStorage.getItem(key);
      }
    } catch (error) {
      console.error("Não foi possível ler todo o armazenamento local:", error);
    }
    return snapshot;
  }

  global.storage = Object.freeze({ get, set, setMany, remove, snapshotRaw, getFailureCount: () => failureCount,
    subscribeErrors(listener) { listeners.add(listener); return () => listeners.delete(listener); } });
})(window);
