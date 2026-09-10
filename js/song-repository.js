(function (global) {
  "use strict";

  const CURRENT_STORAGE_KEY = "sc_songs_v1";
  const LEGACY_STORAGE_KEY = "cifras_musicas_v1";
  const OWNER_CACHES_KEY = "sc_personal_song_caches_v1";
  const LEGACY_OWNER_KEY = "sc_legacy_library_owner_v1";
  let activeOwnerId = null;
  let legacyCandidateOwnerId = null;

  function requireDependencies() {
    if (!global.storage || !global.songModel) {
      throw new Error("storage e songModel devem ser carregados antes de songRepository.");
    }
  }

  function persistCurrent(songs) {
    return global.storage.set(CURRENT_STORAGE_KEY, songs);
  }

  function normalized(collection) {
    return global.songModel.normalizeCollection(Array.isArray(collection) ? collection : []);
  }

  function ownerCaches() {
    const value = global.storage.get(OWNER_CACHES_KEY, {});
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function saveOwnerCache(ownerId, collection) {
    const caches = ownerCaches();
    caches[String(ownerId)] = normalized(collection);
    return global.storage.set(OWNER_CACHES_KEY, caches);
  }

  function sameCollection(left, right) {
    try { return JSON.stringify(normalized(left)) === JSON.stringify(normalized(right)); }
    catch (_error) { return false; }
  }

  function activateOwner(ownerId, currentSongs, defaultSongs) {
    requireDependencies();
    const nextOwner = String(ownerId || "").trim();
    if (!nextOwner) return { songs: normalized(currentSongs), migrationCandidate: false, ownerId: null };
    if (activeOwnerId && activeOwnerId !== nextOwner && activeOwnerId !== legacyCandidateOwnerId) {
      saveOwnerCache(activeOwnerId, currentSongs);
    }
    activeOwnerId = nextOwner;
    const caches = ownerCaches();
    if (Array.isArray(caches[nextOwner])) {
      legacyCandidateOwnerId = null;
      return { songs: normalized(caches[nextOwner]), migrationCandidate: false, ownerId: nextOwner };
    }
    const reservedOwner = String(global.storage.get(LEGACY_OWNER_KEY, "") || "").trim();
    const stored = global.storage.get(CURRENT_STORAGE_KEY, null);
    const legacy = global.storage.get(LEGACY_STORAGE_KEY, null);
    const candidate = Array.isArray(stored) ? stored : Array.isArray(legacy) ? legacy : [];
    const hasPersonalCandidate = candidate.length > 0 && !sameCollection(candidate, defaultSongs);
    if ((!reservedOwner || reservedOwner === nextOwner) && hasPersonalCandidate) {
      if (!reservedOwner) global.storage.set(LEGACY_OWNER_KEY, nextOwner);
      legacyCandidateOwnerId = nextOwner;
      return { songs: normalized(candidate), migrationCandidate: true, ownerId: nextOwner };
    }
    legacyCandidateOwnerId = null;
    return { songs: [], migrationCandidate: false, ownerId: nextOwner };
  }

  function confirmActiveOwner(collection) {
    if (!activeOwnerId) return false;
    const saved = saveOwnerCache(activeOwnerId, collection);
    if (saved) {
      global.storage.set(LEGACY_OWNER_KEY, activeOwnerId);
      legacyCandidateOwnerId = null;
    }
    return saved;
  }

  function load(defaultSongs) {
    requireDependencies();
    const current = global.storage.get(CURRENT_STORAGE_KEY, null);
    if (Array.isArray(current)) return global.songModel.normalizeCollection(current);

    const legacy = global.storage.get(LEGACY_STORAGE_KEY, null);
    const source = Array.isArray(legacy) ? legacy : defaultSongs;
    const songs = global.songModel.normalizeCollection(source);
    persistCurrent(songs);
    return songs;
  }

  function save(collection) {
    requireDependencies();
    const songs = global.songModel.normalizeCollection(collection);
    if (activeOwnerId && activeOwnerId !== legacyCandidateOwnerId) return saveOwnerCache(activeOwnerId, songs);
    const savedCurrent = global.storage.set(CURRENT_STORAGE_KEY, songs);
    const savedLegacy = global.storage.set(LEGACY_STORAGE_KEY, songs);
    return savedCurrent && savedLegacy;
  }

  function addOrReuse(collection, input, options) {
    requireDependencies();
    const songs = Array.isArray(collection) ? collection.slice() : [];
    const candidate = global.songModel.create(input, options);
    const duplicate = global.songModel.findDuplicate(songs, candidate);
    if (duplicate) {
      const enriched = global.songModel.enrich(duplicate, candidate, options);
      const index = songs.findIndex((song) => String(song.id) === String(duplicate.id));
      songs[index] = enriched;
      return { songs, song: enriched, created: false };
    }
    songs.push(candidate);
    return { songs, song: candidate, created: true };
  }

  function update(collection, id, changes, options) {
    requireDependencies();
    const songs = Array.isArray(collection) ? collection.slice() : [];
    const index = songs.findIndex((song) => String(song.id) === String(id));
    if (index === -1) return { songs, song: null };
    const now = (options && options.now) || new Date().toISOString();
    const updated = global.songModel.create({
      ...songs[index],
      ...changes,
      id: songs[index].id,
      createdAt: songs[index].createdAt,
      updatedAt: now
    }, { ...(options || {}), now });
    songs[index] = updated;
    return { songs, song: updated };
  }

  function remove(collection, id) {
    return (Array.isArray(collection) ? collection : []).filter((song) => String(song.id) !== String(id));
  }

  global.songRepository = Object.freeze({
    storageKey: CURRENT_STORAGE_KEY,
    legacyStorageKey: LEGACY_STORAGE_KEY,
    ownerCachesKey: OWNER_CACHES_KEY,
    legacyOwnerKey: LEGACY_OWNER_KEY,
    load,
    save,
    activateOwner,
    confirmActiveOwner,
    addOrReuse,
    update,
    remove
  });
})(window);
