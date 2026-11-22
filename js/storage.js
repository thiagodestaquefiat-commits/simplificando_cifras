// MANUTENÇÃO: Camada de armazenamento JSON no navegador; não autentica nem sincroniza dados.
// MANUTENÇÃO: As gravações retornam sucesso/falha: quem chama só deve confirmar a alteração após sucesso.
// MANUTENÇÃO: setMany tenta reverter uma gravação parcial, mas não é uma transação real de banco.
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

  // Memória do aparelho cheia (22/11): antes de desistir de gravar, libera espaço apagando SÓ as cópias de
  // segurança antigas (conflitos de sincronização e versões anteriores de músicas). Músicas, eventos,
  // playlists e preferências nunca são apagados. Cada rodada corta pela metade as cópias mais antigas.
  const BACKUP_PREFIXES = ["sc_sync_conflict_backups_v1", "sc_library_recovery_v1:"];
  function isQuotaError(error) {
    return Boolean(error) && (error.name === "QuotaExceededError" || error.name === "NS_ERROR_DOM_QUOTA_REACHED" || error.code === 22 || error.code === 1014 || /quota/i.test(String(error.message || "")));
  }
  function freeBackupSpace(protectedKeys) {
    let freed = false;
    const keys = [];
    try { for (let index = 0; index < global.localStorage.length; index += 1) { const key = global.localStorage.key(index); if (key !== null) keys.push(key); } }
    catch (_error) { return false; }
    keys.filter(key => !protectedKeys.includes(key) && BACKUP_PREFIXES.some(prefix => key.startsWith(prefix))).forEach(key => {
      try {
        const list = JSON.parse(global.localStorage.getItem(key) || "[]");
        if (!Array.isArray(list) || list.length <= 1) { global.localStorage.removeItem(key); freed = true; return; }
        const keep = Math.floor(list.length / 2);
        // Conflitos guardam a mais nova no fim; o histórico de músicas guarda a mais nova no começo.
        const kept = key.startsWith("sc_sync_conflict_backups_v1") ? list.slice(-keep) : list.slice(0, keep);
        global.localStorage.setItem(key, JSON.stringify(kept)); freed = true;
      } catch (_error) {
        try { global.localStorage.removeItem(key); freed = true; } catch (_removeError) {}
      }
    });
    return freed;
  }
  function writeWithRoom(write, protectedKeys) {
    for (let attempt = 0; ; attempt += 1) {
      try { write(); return null; }
      catch (error) {
        if (!isQuotaError(error) || attempt >= 6 || !freeBackupSpace(protectedKeys)) return error;
      }
    }
  }

  function set(key, value) {
    // JSON.stringify(undefined) gravaria o texto "undefined" e apagaria o valor anterior.
    if (value === undefined) { console.error("Gravação ignorada: valor vazio para", key); return false; }
    const text = JSON.stringify(value);
    const error = writeWithRoom(() => global.localStorage.setItem(key, text), [key]);
    if (!error) return true;
    console.error("Não foi possível salvar os dados locais:", key, error);
    notifyFailure("save", error);
    return false;
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
    if (entries.some(([, value]) => value === undefined)) { console.error("Gravação ignorada: valor vazio."); return false; }
    const before = new Map();
    try {
      entries.forEach(([key]) => before.set(key, global.localStorage.getItem(key)));
      const error = writeWithRoom(() => entries.forEach(([key, value]) => global.localStorage.setItem(key, JSON.stringify(value))), entries.map(([key]) => key));
      if (error) throw error;
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
