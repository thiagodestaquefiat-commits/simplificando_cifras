(function (global) {
  "use strict";

  function normalize(value) {
    if (global.songModel && global.songModel.normalizeForIdentity) {
      return global.songModel.normalizeForIdentity(value);
    }
    return String(value || "").trim().toLocaleLowerCase("pt-BR");
  }

  function artistMatches(localArtist, spotifyArtist) {
    const expected = normalize(localArtist);
    if (!expected) return true;
    return String(spotifyArtist || "").split(",").some((artist) => normalize(artist) === expected);
  }

  function findAutomaticMatch(song, tracks) {
    const title = normalize(song && song.title);
    if (!title || !Array.isArray(tracks)) return null;
    const sameTitle = tracks.filter((track) => normalize(track && track.title) === title);
    if (!sameTitle.length) return null;
    if (normalize(song && song.artist)) {
      return sameTitle.find((track) => artistMatches(song.artist, track.artist)) || null;
    }
    return sameTitle.length === 1 ? sameTitle[0] : null;
  }

  function changesForTrack(song, track) {
    return {
      artist: String((song && song.artist) || "").trim() || String((track && track.artist) || "").trim(),
      album: track && track.album || null,
      duration: track && track.duration,
      coverUrl: track && track.coverUrl || null,
      spotifyTrackId: track && track.spotifyTrackId || null,
      spotifyUri: track && track.spotifyUri || null,
      isrc: track && track.isrc || null
    };
  }

  function searchQuery(song) {
    return [song && song.title, song && song.artist].filter(Boolean).join(" ").trim();
  }

  global.spotifySongLinker = Object.freeze({
    findAutomaticMatch,
    changesForTrack,
    searchQuery
  });
})(window);
