// MANUTENÇÃO: Playlists pessoais (ex.: uma por ministro). Cada item aponta para uma música da biblioteca
// MANUTENÇÃO: e guarda o próprio tom/capo/BPM (playback). A música da biblioteca nunca é alterada por aqui.
// MANUTENÇÃO: Os dados ficam separados por conta (owner) e nunca são apagados por migração automática.
(function (global) {
  "use strict";

  const STORAGE_KEY = "sc_user_playlists_v1";
  const PLAYBACK_FIELDS = ["semitones", "capo", "bpm", "meter", "scrollSpeed", "instrument", "sheetView", "fontSize", "tablatureFontSize"];
  const listeners = new Set();

  const store = () => global.storage;
  const now = () => new Date().toISOString();
  const newId = (prefix) => prefix + "_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);

  // ── Armazenamento ─────────────────────────────────────────────────────
  // As playlists ficam no IndexedDB (centenas de MB). O localStorage (~5 MB, compartilhado com a
  // biblioteca) enchia e a playlist grande não cabia. Leituras vêm da memória; gravações vão para
  // o IndexedDB. Sem IndexedDB (ou até ele abrir), usa o localStorage como antes.
  // Migração: copia o que está no localStorage para o IndexedDB e só então libera o localStorage.
  const DELETED_KEY = "sc_user_playlists_deleted_v1";
  const DB_NAME = "roudy-user-playlists-v1", DB_STORE = "kv";
  const RECORDS = { all: STORAGE_KEY, deleted: DELETED_KEY };
  const memory = {};          // { all: {...}, deleted: {...} }
  const dirty = new Set();    // registros alterados que ainda precisam ir para o IndexedDB
  let db = null, readyResolve;
  const ready = new Promise((resolve) => { readyResolve = resolve; });
  const channel = typeof global.BroadcastChannel === "function" ? new global.BroadcastChannel("roudy-user-playlists") : null;
  const plain = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const clone = (value) => JSON.parse(JSON.stringify(value));

  function localRead(name) { return plain(store() ? store().get(RECORDS[name], {}) : {}); }
  function readRecord(name) {
    if (!(name in memory)) memory[name] = localRead(name);
    return clone(memory[name]);
  }
  function idbRequest(request) {
    return new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
  }
  function idbPut(values) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, "readwrite");
      Object.entries(values).forEach(([name, value]) => tx.objectStore(DB_STORE).put(value, name));
      tx.oncomplete = () => resolve(true);
      tx.onerror = tx.onabort = () => reject(tx.error || new Error("IndexedDB"));
    });
  }
  let flushing = null;
  function flush() {
    if (!db || flushing) return flushing;
    const names = [...dirty];
    if (!names.length) return null;
    dirty.clear();
    const values = Object.fromEntries(names.map((name) => [name, clone(memory[name] || {})]));
    flushing = idbPut(values).then(() => {
      channel?.postMessage({ type: "changed" });
    }).catch((error) => {
      // IndexedDB falhou: tenta guardar no localStorage para não perder a alteração.
      console.error("[playlists] não foi possível gravar no IndexedDB:", error);
      names.forEach((name) => { if (!(store() && store().set(RECORDS[name], values[name]) !== false)) global.showToast?.("⚠️ Não foi possível salvar a playlist neste aparelho."); });
    }).finally(() => { flushing = null; if (dirty.size) flush(); });
    return flushing;
  }
  function writeRecord(name, value) {
    if (db) { memory[name] = value; dirty.add(name); flush(); return true; }
    // IndexedDB ainda abrindo (ou indisponível): grava no localStorage como antes.
    if (store() && store().set(RECORDS[name], value) !== false) { memory[name] = value; return true; }
    if (global.indexedDB) { memory[name] = value; dirty.add(name); return true; } // vai para o IndexedDB quando abrir
    return false;
  }
  function notifyAll() {
    Object.keys(memory.all || {}).forEach((owner) => listeners.forEach((listener) => { try { listener(owner); } catch (_error) {} }));
    if (!Object.keys(memory.all || {}).length) listeners.forEach((listener) => { try { listener("local"); } catch (_error) {} });
  }
  // Junta duas cópias sem perder nada: por playlist, fica a atualizada por último.
  function mergeAll(primary, secondary) {
    const result = clone(plain(primary));
    for (const [owner, list] of Object.entries(plain(secondary))) {
      if (!Array.isArray(list)) continue;
      const current = Array.isArray(result[owner]) ? result[owner] : [];
      for (const playlist of list) {
        if (!playlist || !playlist.id) continue;
        const index = current.findIndex((value) => value && value.id === playlist.id);
        if (index < 0) current.push(playlist);
        else if (String(playlist.updatedAt || "") > String(current[index].updatedAt || "")) current[index] = playlist;
      }
      result[owner] = current;
    }
    return result;
  }
  async function reloadFromDb() {
    const tx = db.transaction(DB_STORE, "readonly"), objects = tx.objectStore(DB_STORE);
    const [all, deleted] = await Promise.all([idbRequest(objects.get("all")), idbRequest(objects.get("deleted"))]);
    return { all, deleted };
  }
  async function init() {
    if (!global.indexedDB) { readyResolve(); return; }
    try {
      db = await new Promise((resolve, reject) => {
        const request = global.indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(DB_STORE)) request.result.createObjectStore(DB_STORE); };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error("IndexedDB bloqueado"));
      });
      const stored = await reloadFromDb();
      const local = { all: localRead("all"), deleted: localRead("deleted") };
      const pending = new Set(dirty);
      // Nada se perde: IndexedDB + localStorage + o que foi gravado enquanto abria.
      memory.all = mergeAll(mergeAll(plain(stored.all), local.all), pending.has("all") ? memory.all : {});
      memory.deleted = { ...plain(stored.deleted), ...local.deleted, ...(pending.has("deleted") ? plain(memory.deleted) : {}) };
      await idbPut({ all: clone(memory.all), deleted: clone(memory.deleted) });
      dirty.delete("all"); dirty.delete("deleted");
      // Já está seguro no IndexedDB: libera o espaço do localStorage.
      if (store()?.remove) { store().remove(STORAGE_KEY); store().remove(DELETED_KEY); }
      channel && (channel.onmessage = async () => {
        try { const fresh = await reloadFromDb(); memory.all = plain(fresh.all); memory.deleted = plain(fresh.deleted); notifyAll(); } catch (_error) {}
      });
      notifyAll();
    } catch (error) {
      console.warn("[playlists] IndexedDB indisponível; usando o armazenamento local.", error);
      db = null;
      // Grava no localStorage o que estava esperando o IndexedDB.
      dirty.forEach((name) => store()?.set(RECORDS[name], memory[name]));
      dirty.clear();
    } finally {
      readyResolve();
    }
  }

  function readAll() { return readRecord("all"); }

  function cleanPlayback(value) {
    const playback = {};
    if (!value || typeof value !== "object") return playback;
    for (const field of PLAYBACK_FIELDS) if (value[field] !== undefined && value[field] !== null && value[field] !== "") playback[field] = value[field];
    if (playback.semitones !== undefined) playback.semitones = Number(playback.semitones) || 0;
    if (playback.capo !== undefined) playback.capo = Math.max(0, Math.min(12, Number(playback.capo) || 0));
    return playback;
  }

  function normalizeItem(item) {
    if (!item || item.songId === undefined || item.songId === null || item.songId === "") return null;
    return { id: String(item.id || newId("pli")), songId: item.songId, playback: cleanPlayback(item.playback), notes: String(item.notes || "").slice(0, 500), ...(item.song && typeof item.song === "object" ? { song: item.song } : {}) };
  }

  function normalizePlaylist(value) {
    if (!value || typeof value !== "object") return null;
    const name = String(value.name || "").trim().slice(0, 120);
    if (!name) return null;
    return {
      id: String(value.id || newId("pl")),
      name,
      description: String(value.description || "").trim().slice(0, 300),
      coverImage: typeof value.coverImage === "string" && value.coverImage.startsWith("data:image/") ? value.coverImage : null,
      pinned: Boolean(value.pinned),
      items: (Array.isArray(value.items) ? value.items : []).map(normalizeItem).filter(Boolean),
      sharedFrom: value.sharedFrom ? String(value.sharedFrom) : null,
      ...(value.collaboration && typeof value.collaboration === "object" ? { collaboration: value.collaboration } : {}),
      // Sincronização da playlist pessoal com a nuvem (versão/assinatura do último envio); ver personal-playlist-sync.js.
      ...(value.cloud && typeof value.cloud === "object" && !value.collaboration ? { cloud: { ...value.cloud } } : {}),
      createdAt: value.createdAt || now(),
      updatedAt: value.updatedAt || now()
    };
  }

  function all(owner) {
    const values = readAll()[String(owner || "local")];
    return (Array.isArray(values) ? values : []).map(normalizePlaylist).filter(Boolean);
  }

  function list(owner) { return all(owner).filter(playlist => !playlist.collaboration?.deleted); }

  // Remote reception bypasses edit hooks. Each playlist and its durable queue are
  // saved together in one storage write, so a failed write never acknowledges an edit.
  function replace(owner, playlist) {
    const values = all(owner), index = values.findIndex(value => value.id === playlist.id);
    if (index < 0) values.push(playlist); else values[index] = playlist;
    return save(owner, values);
  }

  function save(owner, playlists) {
    const all = readAll();
    all[String(owner || "local")] = playlists.map(normalizePlaylist).filter(Boolean);
    const ok = writeRecord("all", all);
    if (ok) listeners.forEach((listener) => { try { listener(String(owner || "local")); } catch (_error) {} });
    return ok;
  }

  function get(owner, id) {
    return list(owner).find((playlist) => playlist.id === String(id)) || null;
  }

  function update(owner, id, change) {
    const playlists = all(owner);
    const index = playlists.findIndex((playlist) => playlist.id === String(id));
    if (index < 0) return null;
    let next = normalizePlaylist({ ...change(playlists[index]), id: playlists[index].id, createdAt: playlists[index].createdAt, updatedAt: now() });
    if (!next) return null;
    if (playlists[index].collaboration && global.playlistCollaboration) next = global.playlistCollaboration.prepare(playlists[index], next);
    playlists[index] = next;
    return save(owner, playlists) ? next : null;
  }

  function create(owner, name, items = [], extra = {}) {
    const playlist = normalizePlaylist({ ...extra, id: newId("pl"), name, items, createdAt: now(), updatedAt: now() });
    if (!playlist) return null;
    return save(owner, [...all(owner), playlist]) ? playlist : null;
  }

  function rename(owner, id, name) {
    const clean = String(name || "").trim();
    if (!clean) return null;
    return update(owner, id, (playlist) => ({ ...playlist, name: clean }));
  }

  // Exclusões feitas pela pessoa, para a sincronização apagar também na nuvem.
  // A nuvem só é apagada a partir daqui: playlist que "sumiu" do aparelho por outro motivo é baixada de volta.
  function deletions(owner) {
    return { ...(readRecord("deleted")[String(owner || "local")] || {}) };
  }
  function setDeletions(owner, map) {
    const value = readRecord("deleted");
    value[String(owner || "local")] = map;
    return writeRecord("deleted", value);
  }

  function remove(owner, id, options = {}) {
    const current = get(owner, id);
    if (current?.collaboration) return Boolean(update(owner, id, playlist => ({ ...playlist, collaboration: { ...playlist.collaboration, deleted: true } })));
    const playlists = all(owner);
    const next = playlists.filter((playlist) => playlist.id !== String(id));
    if (next.length === playlists.length) return false;
    if (current?.cloud && !options.fromCloud) {
      const map = deletions(owner);
      map[String(id)] = { version: current.cloud.version ?? null, at: now() };
      if (!setDeletions(owner, map)) return false;
    }
    return save(owner, next);
  }

  function duplicate(owner, id) {
    const source = get(owner, id);
    if (!source) return null;
    return create(owner, source.name + " (cópia)", source.items.map((item) => ({ ...item, id: undefined })), { description: source.description });
  }

  function addSong(owner, id, songId, playback = {}) {
    return update(owner, id, (playlist) => ({ ...playlist, items: [...playlist.items, { songId, playback }] }));
  }

  function removeItem(owner, id, itemId) {
    return update(owner, id, (playlist) => ({ ...playlist, items: playlist.items.filter((item) => item.id !== String(itemId)) }));
  }

  function moveItem(owner, id, itemId, direction) {
    return update(owner, id, (playlist) => {
      const items = [...playlist.items];
      const from = items.findIndex((item) => item.id === String(itemId));
      const to = from + Number(direction);
      if (from < 0 || to < 0 || to >= items.length) return playlist;
      const [moved] = items.splice(from, 1);
      items.splice(to, 0, moved);
      return { ...playlist, items };
    });
  }

  function setItemPlayback(owner, id, itemId, playback) {
    return update(owner, id, (playlist) => ({
      ...playlist,
      items: playlist.items.map((item) => item.id === String(itemId) ? { ...item, playback: { ...item.playback, ...cleanPlayback(playback) } } : item)
    }));
  }

  function setItemNotes(owner, id, itemId, notes) {
    return update(owner, id, (playlist) => ({ ...playlist, items: playlist.items.map((item) => item.id === String(itemId) ? { ...item, notes: String(notes || "").trim() } : item) }));
  }

  function setItemContent(owner, id, itemId, song, playback) {
    return update(owner, id, playlist => ({ ...playlist, items: playlist.items.map(item => item.id === String(itemId)
      ? { ...item, song: { ...song, id: item.song?.id ?? song.id }, ...(playback ? { playback: { ...item.playback, ...cleanPlayback(playback) } } : {}) } : item) }));
  }

  function setCoverImage(owner, id, coverImage) {
    const value = typeof coverImage === "string" && coverImage.startsWith("data:image/") ? coverImage : null;
    return update(owner, id, (playlist) => ({ ...playlist, coverImage: value }));
  }

  function setPinned(owner, id, pinned) {
    return update(owner, id, (playlist) => ({ ...playlist, pinned: Boolean(pinned) }));
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  global.userPlaylists = Object.freeze({ STORAGE_KEY, ready, flush: () => flush() || Promise.resolve(), deletions, setDeletions, PLAYBACK_FIELDS, all, replace, list, get, create, rename, remove, duplicate, addSong, removeItem, moveItem, setItemPlayback, setItemNotes, setItemContent, setCoverImage, setPinned, cleanPlayback, subscribe });
  init();
})(window);
