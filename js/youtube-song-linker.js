(function (global) {
  "use strict";

  function normalize(value) {
    if (global.songModel && global.songModel.normalizeForIdentity) return global.songModel.normalizeForIdentity(value);
    return String(value || "").trim().toLocaleLowerCase("pt-BR");
  }

  function findAutomaticMatch(song, videos) {
    const title = normalize(song && song.title);
    const artist = normalize(song && song.artist);
    if (!title || !Array.isArray(videos)) return null;
    return videos.find((video) => {
      const videoTitle = normalize(video && video.title);
      if (!videoTitle.includes(title)) return false;
      if (!artist) return true;
      return `${videoTitle} ${normalize(video && (video.youtubeChannelTitle || video.artist))}`.includes(artist);
    }) || null;
  }

  function changesForVideo(song, video) {
    return {
      artist: String((song && song.artist) || "").trim() || String((video && video.artist) || "").trim(),
      coverUrl: video && video.coverUrl || (song && song.coverUrl) || null,
      youtubeVideoId: video && video.youtubeVideoId || null,
      youtubeUrl: video && video.youtubeUrl || null,
      youtubeChannelTitle: video && (video.youtubeChannelTitle || video.artist) || null
    };
  }

  function searchQuery(song) {
    return [song && song.title, song && song.artist].filter(Boolean).join(" ").trim();
  }

  global.youtubeSongLinker = Object.freeze({ findAutomaticMatch, changesForVideo, searchQuery });
})(window);
