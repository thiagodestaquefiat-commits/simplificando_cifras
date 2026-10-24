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

  function readAll() {
    const value = store() ? store().get(STORAGE_KEY, {}) : {};
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

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
    const ok = store() ? store().set(STORAGE_KEY, all) !== false : false;
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

  function remove(owner, id) {
    const current = get(owner, id);
    if (current?.collaboration) return Boolean(update(owner, id, playlist => ({ ...playlist, collaboration: { ...playlist.collaboration, deleted: true } })));
    const playlists = all(owner);
    const next = playlists.filter((playlist) => playlist.id !== String(id));
    return next.length !== playlists.length && save(owner, next);
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

  global.userPlaylists = Object.freeze({ STORAGE_KEY, PLAYBACK_FIELDS, all, replace, list, get, create, rename, remove, duplicate, addSong, removeItem, moveItem, setItemPlayback, setItemNotes, setItemContent, setCoverImage, setPinned, cleanPlayback, subscribe });
})(window);
