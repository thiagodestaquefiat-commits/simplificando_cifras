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

  // ARMAZENAMENTO GRANDE (26/11): os caches da conta (eventos e biblioteca) passavam de 4 MB e o navegador
  // dá ~5 MB para o localStorage inteiro. No celular a memória enchia ("Não foi possível adicionar a música
  // ao repertório") e cada gravação regravava megabytes, travando a tela. Essas duas chaves agora ficam no
  // IndexedDB (centenas de MB), com uma cópia em memória para leitura imediata e gravação em segundo plano.
  // Se o IndexedDB não existir ou falhar, tudo continua no localStorage, exatamente como antes.
  const LARGE_KEYS = new Set(["sc_personal_event_caches_v1", "sc_personal_song_caches_v1"]);
  const DB_NAME = "roudy-storage", DB_STORE = "kv", FLUSH_DELAY_MS = 400;
  const large = { mode: "local", texts: new Map(), dirty: new Set(), timer: null, db: null };
  // Sem IndexedDB (testes em Node, navegadores antigos): decide na hora, sem fase de espera.
  let readySettled = !global.indexedDB;
  function openDatabase() {
    return new Promise((resolve, reject) => {
      if (!global.indexedDB) { reject(new Error("IndexedDB indisponível")); return; }
      const request = global.indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(DB_STORE)) request.result.createObjectStore(DB_STORE); };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("IndexedDB não abriu"));
      request.onblocked = () => reject(new Error("IndexedDB bloqueado"));
    });
  }
  function idbRequest(mode, work) {
    return new Promise((resolve, reject) => {
      const transaction = large.db.transaction(DB_STORE, mode), store = transaction.objectStore(DB_STORE);
      let result; const request = work(store); if (request) request.onsuccess = () => { result = request.result; };
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = transaction.onabort = () => reject(transaction.error || new Error("IndexedDB falhou"));
    });
  }
  function flushLarge() {
    if (large.mode !== "idb" || !large.dirty.size) return Promise.resolve(true);
    clearTimeout(large.timer); large.timer = null;
    const entries = [...large.dirty].map(key => [key, large.texts.get(key)]); large.dirty.clear();
    return idbRequest("readwrite", store => { entries.forEach(([key, text]) => text === undefined ? store.delete(key) : store.put(text, key)); })
      .then(() => true)
      .catch(error => { entries.forEach(([key]) => large.dirty.add(key)); console.error("Não foi possível gravar no armazenamento grande:", error); notifyFailure("save", error); return false; });
  }
  function scheduleLargeFlush() {
    if (large.timer) return;
    large.timer = setTimeout(() => { large.timer = null; flushLarge(); }, FLUSH_DELAY_MS);
  }
  // Pronto quando as chaves grandes já foram lidas do IndexedDB (ou ficou decidido usar o localStorage).
  const ready = (async () => {
    try {
      large.db = await openDatabase();
      const loaded = new Map();
      await idbRequest("readonly", store => { [...LARGE_KEYS].forEach(key => { const request = store.get(key); request.onsuccess = () => { if (typeof request.result === "string") loaded.set(key, request.result); }; }); });
      // Migração: o que ainda está no localStorage vai para o IndexedDB. Só depois de gravado e conferido
      // é que sai do localStorage (os dados são movidos, nunca apagados).
      const moving = [];
      [...LARGE_KEYS].forEach(key => {
        if (large.dirty.has(key)) return; // gravado nesta sessão antes de ficar pronto: vale o mais novo
        if (loaded.has(key)) { large.texts.set(key, loaded.get(key)); return; }
        const legacy = global.localStorage.getItem(key);
        if (legacy !== null) { large.texts.set(key, legacy); moving.push([key, legacy]); }
      });
      large.mode = "idb";
      if (moving.length) {
        await idbRequest("readwrite", store => { moving.forEach(([key, text]) => store.put(text, key)); });
        const check = new Map();
        await idbRequest("readonly", store => { moving.forEach(([key]) => { const request = store.get(key); request.onsuccess = () => check.set(key, request.result); }); });
        moving.forEach(([key, text]) => { if (check.get(key) === text) { try { global.localStorage.removeItem(key); } catch (_error) {} } });
      }
      if (large.dirty.size) await flushLarge();
      // Caches que já estão no IndexedDB não precisam mais da cópia antiga no localStorage.
      [...LARGE_KEYS].forEach(key => { if (loaded.has(key)) { try { global.localStorage.removeItem(key); } catch (_error) {} } });
      global.addEventListener?.("pagehide", () => { flushLarge(); });
      global.document?.addEventListener?.("visibilitychange", () => { if (global.document.visibilityState === "hidden") flushLarge(); });
      return "idb";
    } catch (error) {
      if (large.db) { try { large.db.close(); } catch (_error) {} }
      large.db = null;
      // Sem IndexedDB: o que foi gravado em memória antes de decidir vai para o localStorage.
      const pending = [...large.dirty]; large.dirty.clear(); large.mode = "local";
      pending.forEach(key => { const text = large.texts.get(key); try { if (text === undefined) global.localStorage.removeItem(key); else global.localStorage.setItem(key, text); } catch (writeError) { notifyFailure("save", writeError); } });
      large.texts.clear();
      return "local";
    }
  })();
  function largeText(key) {
    if (large.texts.has(key)) return large.texts.get(key);
    return global.localStorage.getItem(key);
  }

  function get(key, fallback) {
    try {
      const value = LARGE_KEYS.has(key) ? largeText(key) : global.localStorage.getItem(key);
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
    if (LARGE_KEYS.has(key) && large.mode === "idb") { large.texts.set(key, text); large.dirty.add(key); scheduleLargeFlush(); return true; }
    if (LARGE_KEYS.has(key) && !large.db && large.mode === "local" && !readySettled) { large.texts.set(key, text); large.dirty.add(key); return true; }
    const error = writeWithRoom(() => global.localStorage.setItem(key, text), [key]);
    if (!error) return true;
    console.error("Não foi possível salvar os dados locais:", key, error);
    notifyFailure("save", error);
    return false;
  }

  function remove(key) {
    if (LARGE_KEYS.has(key) && (large.mode === "idb" || !readySettled)) { large.texts.set(key, undefined); large.dirty.add(key); if (large.mode === "idb") scheduleLargeFlush(); }
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
    if (entries.some(([key]) => LARGE_KEYS.has(key))) {
      const small = entries.filter(([key]) => !LARGE_KEYS.has(key));
      if (small.length && !setMany(small)) return false;
      return entries.filter(([key]) => LARGE_KEYS.has(key)).every(([key, value]) => set(key, value));
    }
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
    large.texts.forEach((text, key) => { if (text === undefined) delete snapshot[key]; else snapshot[key] = text; });
    return snapshot;
  }

  ready.then(() => { readySettled = true; }, () => { readySettled = true; });
  global.storage = Object.freeze({ get, set, setMany, remove, snapshotRaw, getFailureCount: () => failureCount,
    ready, flush: flushLarge, largeMode: () => large.mode, largeKeys: [...LARGE_KEYS],
    subscribeErrors(listener) { listeners.add(listener); return () => listeners.delete(listener); } });
})(window);
