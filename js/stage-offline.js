(function (global) {
  'use strict';

  const STORAGE_KEY = 'sc_stage_offline_v1';
  const MAX_PACKAGES = 12;

  function storageApi() {
    return global.storage || {
      get(key, fallback) {
        try {
          return JSON.parse(global.localStorage.getItem(key)) || fallback;
        } catch (_) {
          return fallback;
        }
      },
      set(key, value) {
        global.localStorage.setItem(key, JSON.stringify(value));
      }
    };
  }

  function packageKey(userId, contextId) {
    return `${String(userId || 'local-user')}:${String(contextId || 'single-song')}`;
  }

  function compactSong(song) {
    if (!song || typeof song !== 'object') return null;
    return {
      id: song.id,
      title: song.title || '',
      artist: song.artist || '',
      key: song.key || '',
      capo: song.capo ?? null,
      bpm: song.bpm ?? null,
      timeSignature: song.timeSignature || '',
      blocos: Array.isArray(song.blocos) ? song.blocos : [],
      fullChordSheet: song.fullChordSheet || '',
      personalNotes: song.personalNotes || '',
      sharedNotes: song.sharedNotes || ''
    };
  }

  function prepare({ userId, contextId, event, songs, preferences }) {
    const api = storageApi();
    const root = api.get(STORAGE_KEY, {});
    const preparedSongs = (Array.isArray(songs) ? songs : []).map(compactSong).filter(Boolean);
    const now = new Date().toISOString();
    const pack = {
      version: 1,
      userId: String(userId || 'local-user'),
      contextId: String(contextId || 'single-song'),
      preparedAt: now,
      event: event ? {
        id: event.id,
        title: event.title || event.name || '',
        date: event.date || '',
        time: event.time || '',
        location: event.location || event.address || '',
        leaderId: event.leaderId || null
      } : null,
      order: preparedSongs.map((song) => song.id),
      songs: preparedSongs,
      preferences: preferences && typeof preferences === 'object' ? { ...preferences } : {}
    };

    const nextRoot = { ...(root || {}), [packageKey(userId, contextId)]: pack };
    const entries = Object.entries(nextRoot)
      .sort((left, right) => String(right[1]?.preparedAt || '').localeCompare(String(left[1]?.preparedAt || '')))
      .slice(0, MAX_PACKAGES);
    api.set(STORAGE_KEY, Object.fromEntries(entries));
    return pack;
  }

  function get(userId, contextId) {
    const root = storageApi().get(STORAGE_KEY, {});
    return root?.[packageKey(userId, contextId)] || null;
  }

  function isReady(userId, contextId, songIds) {
    const pack = get(userId, contextId);
    if (!pack) return false;
    const required = Array.isArray(songIds) ? songIds.map(String) : [];
    const saved = new Set((pack.order || []).map(String));
    return required.every((id) => saved.has(id));
  }

  global.stageOffline = { STORAGE_KEY, prepare, get, isReady };
})(window);
