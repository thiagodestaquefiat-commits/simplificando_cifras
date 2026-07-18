(function (global) {
  "use strict";

  let state = null;

  function clear() {
    state = null;
  }

  function setPlaylist(playlistId, songIds, currentIndex) {
    const orderedIds = Array.isArray(songIds) ? [...songIds] : [];
    const index = Number(currentIndex);
    if (!orderedIds.length || !Number.isInteger(index) || index < 0 || index >= orderedIds.length) {
      clear();
      return null;
    }
    state = Object.freeze({
      source: "playlist",
      playlistId,
      songIds: Object.freeze(orderedIds),
      currentIndex: index
    });
    return get();
  }

  function get() {
    if (!state) return null;
    return {
      source: state.source,
      playlistId: state.playlistId,
      songIds: [...state.songIds],
      currentIndex: state.currentIndex
    };
  }

  function move(direction) {
    if (!state) return null;
    const nextIndex = state.currentIndex + Number(direction);
    if (nextIndex < 0 || nextIndex >= state.songIds.length) return null;
    const nextSongId = state.songIds[nextIndex];
    state = Object.freeze({ ...state, currentIndex: nextIndex });
    return { songId: nextSongId, context: get() };
  }

  function availability() {
    if (!state) return { active: false, canPrevious: false, canNext: false };
    return {
      active: true,
      canPrevious: state.currentIndex > 0,
      canNext: state.currentIndex < state.songIds.length - 1
    };
  }

  global.navigationContext = Object.freeze({ clear, setPlaylist, get, move, availability });
})(window);
