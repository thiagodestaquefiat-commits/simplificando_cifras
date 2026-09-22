(function (global) {
  "use strict";

  const CURRENT_STORAGE_KEY = "sc_songs_v1";
  const LEGACY_STORAGE_KEY = "cifras_musicas_v1";
  const OWNER_CACHES_KEY = "sc_personal_song_caches_v1";
  const OWNER_DELETIONS_KEY = "sc_personal_song_deletions_v1";
  const LEGACY_OWNER_KEY = "sc_legacy_library_owner_v1";
  const SEED_ONLY_KEY = "sc_seed_library_only_v1";
  let activeOwnerId = null;
  let legacyCandidateOwnerId = null;
  let storedLibraryExistedAtBoot = false;

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

  function migrateCollection(collection) {
    const migration = global.demoLibrary ? global.demoLibrary.migrate(collection) : { songs: collection, removed: 0, seeded: false };
    const songs = normalized(migration.songs);
    if (migration.removed && global.demoLibrary) global.demoLibrary.markMigrated(global.storage, { removed: migration.removed, seeded: migration.seeded });
    return { ...migration, songs };
  }

  function hasStoredLibrary() {
    return Array.isArray(global.storage.get(CURRENT_STORAGE_KEY, null)) || Array.isArray(global.storage.get(LEGACY_STORAGE_KEY, null));
  }

  function ownerCaches() {
    const value = global.storage.get(OWNER_CACHES_KEY, {});
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function ownerDeletions() {
    const value = global.storage.get(OWNER_DELETIONS_KEY, {});
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function deletedClientIds(ownerId) {
    const values = ownerDeletions()[String(ownerId)] || {};
    return new Set(Object.keys(values));
  }

  function filterDeleted(ownerId, collection) {
    const deleted = deletedClientIds(ownerId);
    return migrateCollection(collection).songs.filter((song) => {
      const clientId = String(song && song.librarySync && song.librarySync.clientId || "").trim();
      return !clientId || !deleted.has(clientId);
    });
  }

  function saveOwnerCache(ownerId, collection) {
    const caches = ownerCaches();
    caches[String(ownerId)] = filterDeleted(ownerId, collection);
    return global.storage.set(OWNER_CACHES_KEY, caches);
  }

  function markDeleted(songOrClientId, confirmed) {
    if (!activeOwnerId) return false;
    const clientId = String(typeof songOrClientId === "string" ? songOrClientId : songOrClientId && songOrClientId.librarySync && songOrClientId.librarySync.clientId || "").trim();
    if (!clientId) return false;
    const deletions = ownerDeletions();
    const ownerValues = deletions[activeOwnerId] && typeof deletions[activeOwnerId] === "object" ? deletions[activeOwnerId] : {};
    const existing = ownerValues[clientId];
    const entry = existing && typeof existing === "object" ? existing : { deletedAt: typeof existing === "string" ? existing : new Date().toISOString(), confirmedAt: null };
    if (confirmed && !entry.confirmedAt) entry.confirmedAt = new Date().toISOString();
    ownerValues[clientId] = entry;
    deletions[activeOwnerId] = ownerValues;
    const saved = global.storage.set(OWNER_DELETIONS_KEY, deletions);
    if (saved) {
      const caches = ownerCaches();
      if (Array.isArray(caches[activeOwnerId])) saveOwnerCache(activeOwnerId, caches[activeOwnerId]);
    }
    return saved;
  }

  function confirmDeleted(clientId) {
    return markDeleted(String(clientId || ""), true);
  }

  function stableSongIdentity(song) {
    const clientId = String(song && song.librarySync && song.librarySync.clientId || "").trim();
    if (clientId) return `client:${clientId}`;
    const id = song && song.id;
    return id === undefined || id === null || String(id).trim() === "" ? null : `id:${String(id)}`;
  }

  function mergeLegacyWithOwnerCache(legacyCollection, cachedCollection) {
    const legacySongs = normalized(legacyCollection);
    const cachedSongs = normalized(cachedCollection);
    const cachedByIdentity = new Map();
    cachedSongs.forEach((song) => {
      const identity = stableSongIdentity(song);
      if (identity) cachedByIdentity.set(identity, song);
    });

    const merged = legacySongs.map((song) => {
      const identity = stableSongIdentity(song);
      return identity && cachedByIdentity.has(identity) ? cachedByIdentity.get(identity) : song;
    });
    const mergedIdentities = new Set(merged.map(stableSongIdentity).filter(Boolean));
    cachedSongs.forEach((song) => {
      const identity = stableSongIdentity(song);
      if (identity && mergedIdentities.has(identity)) return;
      merged.push(song);
      if (identity) mergedIdentities.add(identity);
    });
    return merged;
  }

  function hasSongsMissingFromCache(legacyCollection, cachedCollection) {
    const cachedIdentities = new Set(normalized(cachedCollection).map(stableSongIdentity).filter(Boolean));
    return normalized(legacyCollection).some((song) => {
      const identity = stableSongIdentity(song);
      return !identity || !cachedIdentities.has(identity);
    });
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
    const reservedOwner = String(global.storage.get(LEGACY_OWNER_KEY, "") || "").trim();
    const stored = global.storage.get(CURRENT_STORAGE_KEY, null);
    const legacy = global.storage.get(LEGACY_STORAGE_KEY, null);
    const candidate = filterDeleted(nextOwner, Array.isArray(stored) ? stored : Array.isArray(legacy) ? legacy : []);
    const seedOnlyCandidate = Boolean(global.storage.get(SEED_ONLY_KEY, false)) && candidate.length > 0 &&
      global.demoLibrary && candidate.every((song) => global.demoLibrary.isDemoSong(song));
    const hasPersonalCandidate = candidate.length > 0 && storedLibraryExistedAtBoot;
    const canUseLegacyCandidate = (!reservedOwner || reservedOwner === nextOwner) && hasPersonalCandidate;
    if (seedOnlyCandidate && (!Array.isArray(caches[nextOwner]) || caches[nextOwner].every((song) => global.demoLibrary.isDemoSong(song)))) {
      legacyCandidateOwnerId = null;
      return { songs: [], migrationCandidate: false, ownerId: nextOwner, awaitingRemoteOnboarding: true };
    }
    if (Array.isArray(caches[nextOwner])) {
      caches[nextOwner] = filterDeleted(nextOwner, caches[nextOwner]);
      if (canUseLegacyCandidate) {
        if (!reservedOwner) global.storage.set(LEGACY_OWNER_KEY, nextOwner);
        const migrationCandidate = hasSongsMissingFromCache(candidate, caches[nextOwner]);
        legacyCandidateOwnerId = migrationCandidate ? nextOwner : null;
        return {
          songs: mergeLegacyWithOwnerCache(candidate, caches[nextOwner]),
          migrationCandidate,
          ownerId: nextOwner
        };
      }
      legacyCandidateOwnerId = null;
      return { songs: normalized(caches[nextOwner]), migrationCandidate: false, ownerId: nextOwner };
    }
    if (canUseLegacyCandidate) {
      if (!reservedOwner) global.storage.set(LEGACY_OWNER_KEY, nextOwner);
      legacyCandidateOwnerId = nextOwner;
      return { songs: normalized(candidate), migrationCandidate: true, ownerId: nextOwner };
    }
    legacyCandidateOwnerId = null;
    return { songs: [], migrationCandidate: false, ownerId: nextOwner };
  }

  // Encerra a sessão de dono ativo (logout). O cache privado da conta em
  // sc_personal_song_caches_v1 NÃO é apagado — só deixa de ser o alvo de
  // save(). A partir daqui save() volta a gravar no armazenamento local
  // anônimo. Deliberadamente NÃO reusa load(): load() atualiza
  // storedLibraryExistedAtBoot, e essa flag precisa continuar refletindo o
  // que existia no boot real da página, não o que passou a existir no
  // armazenamento anônimo no meio da sessão — senão uma edição feita
  // "deslogado" passaria a se qualificar como candidata de migração
  // silenciosa (activateOwner) para a conta que logar a seguir, mesmo que
  // seja a mesma conta que acabou de sair.
  function deactivateOwner(defaultSongs) {
    activeOwnerId = null;
    legacyCandidateOwnerId = null;
    const stored = global.storage.get(CURRENT_STORAGE_KEY, null);
    if (Array.isArray(stored)) return migrateCollection(stored).songs;
    const legacy = global.storage.get(LEGACY_STORAGE_KEY, null);
    return migrateCollection(Array.isArray(legacy) ? legacy : defaultSongs).songs;
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
    if (Array.isArray(current)) {
      storedLibraryExistedAtBoot = current.length > 0;
      const migration = migrateCollection(current);
      if (migration.removed) persistCurrent(migration.songs);
      return migration.songs;
    }

    const legacy = global.storage.get(LEGACY_STORAGE_KEY, null);
    const source = Array.isArray(legacy) ? legacy : defaultSongs;
    const songs = migrateCollection(source).songs;
    storedLibraryExistedAtBoot = songs.length > 0;
    if (!Array.isArray(legacy)) global.storage.set(SEED_ONLY_KEY, true);
    persistCurrent(songs);
    return songs;
  }

  function save(collection) {
    requireDependencies();
    const songs = activeOwnerId ? filterDeleted(activeOwnerId, collection) : global.songModel.normalizeCollection(collection);
    if (activeOwnerId && activeOwnerId !== legacyCandidateOwnerId) return saveOwnerCache(activeOwnerId, songs);
    global.storage.set(SEED_ONLY_KEY, false);
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
    ownerDeletionsKey: OWNER_DELETIONS_KEY,
    legacyOwnerKey: LEGACY_OWNER_KEY,
    seedOnlyKey: SEED_ONLY_KEY,
    hasStoredLibrary,
    load,
    save,
    activateOwner,
    deactivateOwner,
    confirmActiveOwner,
    addOrReuse,
    update,
    remove,
    markDeleted,
    confirmDeleted,
    getDeletedClientIds: () => activeOwnerId ? [...deletedClientIds(activeOwnerId)] : [],
    getPendingDeletedClientIds: () => {
      if (!activeOwnerId) return [];
      const values = ownerDeletions()[activeOwnerId] || {};
      return Object.keys(values).filter((clientId) => !values[clientId] || typeof values[clientId] !== "object" || !values[clientId].confirmedAt);
    }
  });
})(window);
