(function (global) {
  "use strict";

  const STORAGE_KEY = "sc_events_v1";
  const LEGACY_KEY = "cifras_setlists_v1";

  function requireDependencies() {
    if (!global.storage || !global.eventModel) throw new Error("storage e eventModel são obrigatórios.");
  }

  function load(fallback) {
    requireDependencies();
    const current = global.storage.get(STORAGE_KEY, null);
    if (Array.isArray(current)) return global.eventModel.normalizeCollection(current);
    const legacy = global.storage.get(LEGACY_KEY, fallback || []);
    const migrated = global.eventModel.normalizeCollection(legacy);
    global.storage.set(STORAGE_KEY, migrated);
    return migrated;
  }

  function save(events) {
    requireDependencies();
    const normalized = global.eventModel.normalizeCollection(events);
    const currentSaved = global.storage.set(STORAGE_KEY, normalized);
    const legacySaved = global.storage.set(LEGACY_KEY, normalized);
    return currentSaved && legacySaved;
  }

  function upsert(events, candidate) {
    const normalized = global.eventModel.create(candidate);
    const values = global.eventModel.normalizeCollection(events);
    const index = values.findIndex((item) => String(item.id) === String(normalized.id));
    if (index < 0) values.push(normalized); else values[index] = normalized;
    return { events: values, event: normalized, created: index < 0 };
  }

  function remove(events, eventId) {
    return global.eventModel.normalizeCollection(events).filter((item) => String(item.id) !== String(eventId));
  }

  global.eventRepository = Object.freeze({ storageKey: STORAGE_KEY, legacyKey: LEGACY_KEY, load, save, upsert, remove });
})(window);
