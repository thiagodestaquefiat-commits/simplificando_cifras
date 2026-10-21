(function (global) {
  "use strict";
  const PREFIX = "sc_library_recovery_v1:", MAX_VERSIONS = 20, MAX_BYTES = 1024 * 1024;
  const clone = value => JSON.parse(JSON.stringify(value));
  const key = owner => PREFIX + encodeURIComponent(String(owner || "guest"));
  function list(owner) {
    const items = global.storage.get(key(owner), []);
    return Array.isArray(items) ? items : [];
  }
  function retain(owner, entries) {
    entries=entries.filter(entry=>!list(owner).some(saved=>saved.reason===(entry.reason||"edição")&&musical(saved.song)===musical(global.libraryExporter.sanitize(entry.song))));
    if (!entries.length) return true;
    const additions = entries.map(entry => ({
      id: global.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      savedAt: new Date().toISOString(), reason: entry.reason || "edição",
      song: global.libraryExporter.sanitize(entry.song)
    }));
    // Muitas mudanças de uma vez (sync, atualização do app): guarda só as MAX_VERSIONS mais recentes.
    const kept = additions.slice(0, MAX_VERSIONS).filter(entry => new Blob([JSON.stringify(entry)]).size <= MAX_BYTES);
    if (!kept.length) return false;
    const history = [...kept, ...list(owner)].slice(0, MAX_VERSIONS);
    while (history.length > 1 && new Blob([JSON.stringify(history)]).size > MAX_BYTES) history.pop();
    return global.storage.set(key(owner), history);
  }
  // Armazenamento cheio: descarta as cópias de segurança MAIS ANTIGAS (nunca as músicas) para liberar espaço.
  // Retorna true se liberou algo.
  function shrink(owner) {
    const history = list(owner);
    if (!history.length) return false;
    const keep = Math.floor(history.length / 2);
    return keep ? global.storage.set(key(owner), history.slice(0, keep)) : global.storage.remove(key(owner));
  }
  function musical(song) {
    const copy = clone(song); delete copy.librarySync; delete copy.updatedAt;
    return JSON.stringify(copy);
  }
  function beforeSave(owner, previous, next) {
    const entries = [];
    previous.forEach(song => {
      const replacement = next.find(item => String(item.id) === String(song.id));
      if (!replacement || musical(song) !== musical(replacement)) entries.push({ song, reason: replacement ? "antes da edição" : "antes da exclusão" });
    });
    return retain(owner, entries);
  }
  function copySong(song, ownerId) {
    const copy = global.libraryExporter.sanitize(song);
    copy.id = global.crypto?.randomUUID?.() || `recovered-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    copy.title = `${copy.title || "Música"} — cópia recuperada`;
    delete copy.librarySync;
    copy.accessContext = { scope: "personal", ownerId: ownerId && ownerId !== "guest" ? String(ownerId) : null, teamId: null };
    copy.updatedAt = new Date().toISOString();
    return global.songModel.create(copy);
  }
  global.libraryRecovery = Object.freeze({ list, retain, beforeSave, shrink, copySong, maxVersions: MAX_VERSIONS, maxBytes: MAX_BYTES });
})(window);
