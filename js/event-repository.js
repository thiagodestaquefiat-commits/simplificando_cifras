(function (global) {
  "use strict";

  const STORAGE_KEY = "sc_events_v1";
  const LEGACY_KEY = "cifras_setlists_v1";
  const OWNER_CACHES_KEY = "sc_personal_event_caches_v1";
  const LEGACY_OWNER_KEY = "sc_legacy_events_owner_v1";
  const LEGACY_MIGRATIONS_KEY = "sc_legacy_event_migrations_v1";
  let activeOwnerId = null;
  let legacyCandidateOwnerId = null;
  let legacyCandidateIds = [];
  let storedEventsExistedAtBoot = false;

  function requireDependencies() {
    if (!global.storage || !global.eventModel) throw new Error("storage e eventModel são obrigatórios.");
  }

  function load(fallback, identity) {
    requireDependencies();
    const current = global.storage.get(STORAGE_KEY, null);
    if (Array.isArray(current)) {
      storedEventsExistedAtBoot = true;
      const values = global.eventModel.normalizeCollection(current).map((event) => identity && identity.user ? global.eventModel.migrateCurrentUser(event, identity.user, identity.legacyUserIds) : event);
      global.storage.set(STORAGE_KEY, values);
      return values;
    }
    const legacy = global.storage.get(LEGACY_KEY, fallback || []);
    storedEventsExistedAtBoot = Array.isArray(legacy) && legacy.length > 0;
    const migrated = global.eventModel.normalizeCollection(legacy).map((event) => identity && identity.user ? global.eventModel.migrateCurrentUser(event, identity.user, identity.legacyUserIds) : event);
    global.storage.set(STORAGE_KEY, migrated);
    return migrated;
  }

  function ownerCaches() {
    const value = global.storage.get(OWNER_CACHES_KEY, {});
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function saveOwnerCache(ownerId, events) {
    const caches = ownerCaches();
    caches[String(ownerId)] = global.eventModel.normalizeCollection(events);
    return global.storage.set(OWNER_CACHES_KEY, caches);
  }

  function migratedLegacyIds(ownerId) {
    const state = global.storage.get(LEGACY_MIGRATIONS_KEY, {});
    const values = state && typeof state === "object" && !Array.isArray(state) ? state[String(ownerId)] : [];
    return new Set(Array.isArray(values) ? values.map(String) : []);
  }

  function confirmLegacyIds(ownerId, ids) {
    const state = global.storage.get(LEGACY_MIGRATIONS_KEY, {});
    const safe = state && typeof state === "object" && !Array.isArray(state) ? state : {};
    safe[String(ownerId)] = Array.from(new Set([...(Array.isArray(safe[String(ownerId)]) ? safe[String(ownerId)].map(String) : []), ...ids.map(String)]));
    return global.storage.set(LEGACY_MIGRATIONS_KEY, safe);
  }

  function activateOwner(ownerId, currentEvents, currentUser, legacyIds) {
    requireDependencies();
    const nextOwner = String(ownerId || "").trim();
    if (!nextOwner) return { events: global.eventModel.normalizeCollection(currentEvents), migrationCandidate: false, ownerId: null };
    if (activeOwnerId && activeOwnerId !== nextOwner && activeOwnerId !== legacyCandidateOwnerId) saveOwnerCache(activeOwnerId, currentEvents);
    activeOwnerId = nextOwner;
    const caches = ownerCaches();
    const reservedOwner = String(global.storage.get(LEGACY_OWNER_KEY, "") || "").trim();
    const stored = global.storage.get(STORAGE_KEY, null);
    const legacy = global.storage.get(LEGACY_KEY, null);
    const candidate = Array.isArray(stored) ? stored : Array.isArray(legacy) ? legacy : [];
    const mayClaimLegacy = (!reservedOwner || reservedOwner === nextOwner) && storedEventsExistedAtBoot && candidate.length;
    const migratedIds = migratedLegacyIds(nextOwner);
    const migrated = mayClaimLegacy
      ? global.eventModel.normalizeCollection(candidate).map((event) => global.eventModel.migrateCurrentUser(event, currentUser, legacyIds)).filter((event) => !migratedIds.has(String(event.id)))
      : [];
    if (Array.isArray(caches[nextOwner])) {
      const cached = global.eventModel.normalizeCollection(caches[nextOwner]);
      const cachedIds = new Set(cached.map((event) => String(event.id)));
      const missing = migrated.filter((event) => !cachedIds.has(String(event.id)));
      if (missing.length) {
        if (!reservedOwner) global.storage.set(LEGACY_OWNER_KEY, nextOwner);
        legacyCandidateOwnerId = nextOwner;
        legacyCandidateIds = migrated.map((event) => String(event.id));
        return { events: mergeRemote(migrated, cached), migrationCandidate: true, ownerId: nextOwner };
      }
      if (migrated.length) confirmLegacyIds(nextOwner, migrated.map((event) => String(event.id)));
      legacyCandidateOwnerId = null;
      legacyCandidateIds = [];
      return { events: cached, migrationCandidate: false, ownerId: nextOwner };
    }
    if (migrated.length) {
      if (!reservedOwner) global.storage.set(LEGACY_OWNER_KEY, nextOwner);
      legacyCandidateOwnerId = nextOwner;
      legacyCandidateIds = migrated.map((event) => String(event.id));
      return { events: migrated, migrationCandidate: true, ownerId: nextOwner };
    }
    legacyCandidateOwnerId = null;
    legacyCandidateIds = [];
    return { events: [], migrationCandidate: false, ownerId: nextOwner };
  }

  function confirmActiveOwner(events) {
    if (!activeOwnerId) return false;
    const saved = saveOwnerCache(activeOwnerId, events);
    const migrationSaved = !legacyCandidateIds.length || confirmLegacyIds(activeOwnerId, legacyCandidateIds);
    if (saved && migrationSaved) {
      global.storage.set(LEGACY_OWNER_KEY, activeOwnerId);
      legacyCandidateOwnerId = null;
      legacyCandidateIds = [];
    }
    return saved && migrationSaved;
  }

  function save(events) {
    requireDependencies();
    const normalized = global.eventModel.normalizeCollection(events);
    if (activeOwnerId && activeOwnerId !== legacyCandidateOwnerId) return saveOwnerCache(activeOwnerId, normalized);
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

  function upsertShared(events, candidate, actor) {
    const values = global.eventModel.normalizeCollection(events);
    const current = values.find((item) => String(item.id) === String(candidate && candidate.id));
    const normalized = global.eventModel.create(candidate);
    if (current) global.eventModel.requireLeader(current, actor && actor.id);
    else if (!global.eventModel.isLeader(normalized, actor && actor.id)) throw new Error("O criador precisa ser o líder inicial do evento.");
    return upsert(values, normalized);
  }

  function removeShared(events, eventId, actor) {
    const current = global.eventModel.normalizeCollection(events).find((item) => String(item.id) === String(eventId));
    if (!current) return global.eventModel.normalizeCollection(events);
    global.eventModel.requireLeader(current, actor && actor.id);
    return remove(events, eventId);
  }

  function mergeRemote(events, remoteEvents) {
    const values = global.eventModel.normalizeCollection(events);
    for (const remote of global.eventModel.normalizeCollection(remoteEvents)) {
      const index = values.findIndex((item) => String(item.id) === String(remote.id));
      if (index < 0) values.push(remote);
      else if (values[index].syncState !== "pending" || remote.remoteVersion >= (values[index].remoteVersion || 0)) values[index] = remote;
    }
    return values;
  }

  function reconcileRemote(events, remoteEvents) {
    const localPending = global.eventModel.normalizeCollection(events).filter((event) => event.syncState === "pending" || event.remoteVersion == null);
    return mergeRemote(localPending, remoteEvents);
  }

  global.eventRepository = Object.freeze({ storageKey: STORAGE_KEY, legacyKey: LEGACY_KEY, ownerCachesKey: OWNER_CACHES_KEY, legacyOwnerKey: LEGACY_OWNER_KEY, legacyMigrationsKey: LEGACY_MIGRATIONS_KEY, load, save, activateOwner, confirmActiveOwner, upsert, remove, upsertShared, removeShared, mergeRemote, reconcileRemote });
})(window);
