const assert = require("node:assert/strict");

let requestedUrl = "";
global.window = {
  location: { hostname: "127.0.0.1", origin: "http://127.0.0.1:4173" },
  document: { querySelector: () => null },
  fetch: async (url) => {
    requestedUrl = url;
    return {
      ok: true,
      status: 200,
      json: async () => ({ videos: [{ videoId: "abc", title: "Canção", channelTitle: "Canal", thumbnailUrl: "https://img.test/abc.jpg", youtubeUrl: "https://www.youtube.com/watch?v=abc" }] })
    };
  }
};
global.document = window.document;

require("../js/youtube-api.js");

(async () => {
  const videos = await window.youtubeApi.searchVideos("Canção Canal", 8);
  assert.match(requestedUrl, /^http:\/\/127\.0\.0\.1:5000\/api\/youtube\/search\?/);
  assert.match(requestedUrl, /q=Can%C3%A7%C3%A3o\+Canal/);
  assert.deepEqual(videos[0], {
    title: "Canção",
    artist: "Canal",
    youtubeChannelTitle: "Canal",
    youtubeVideoId: "abc",
    youtubeUrl: "https://www.youtube.com/watch?v=abc",
    coverUrl: "https://img.test/abc.jpg",
    publishedAt: null,
    key: "",
    capo: "",
    blocos: []
  });
  console.log("youtube-api.test.js: OK");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
