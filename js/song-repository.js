(function (global) {
  "use strict";

  const CURRENT_STORAGE_KEY = "sc_songs_v1";
  const LEGACY_STORAGE_KEY = "cifras_musicas_v1";

  function requireDependencies() {
    if (!global.storage || !global.songModel) {
      throw new Error("storage e songModel devem ser carregados antes de songRepository.");
    }
  }

  function persistCurrent(songs) {
    return global.storage.set(CURRENT_STORAGE_KEY, songs);
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
    load,
    save,
    addOrReuse,
    update,
    remove
  });
})(window);
