const assert = require("node:assert/strict");

let requestedUrl = "";
let responseVideos = [{ videoId: "abc", title: "Canção", channelTitle: "Canal", thumbnailUrl: "https://img.test/abc.jpg", youtubeUrl: "https://www.youtube.com/watch?v=abc" }];
let rejectOembed = false;
global.window = {
  location: { hostname: "127.0.0.1", origin: "http://127.0.0.1:4173" },
  document: { querySelector: () => null },
  fetch: async (url) => {
    requestedUrl = url;
    if (String(url).startsWith("https://www.youtube.com/oembed?")) {
      if (rejectOembed) throw new TypeError("Failed to fetch");
      return {
        ok: true,
        status: 200,
        json: async () => ({ title: "Vídeo exato", author_name: "Canal exato", thumbnail_url: "https://img.test/exato.jpg" })
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ videos: responseVideos })
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
  const linkedId = "dQw4w9WgXcQ";
  assert.equal(window.youtubeApi.extractVideoId(`https://www.youtube.com/watch?v=${linkedId}&list=PL123`), linkedId);
  assert.equal(window.youtubeApi.extractVideoId(`https://youtu.be/${linkedId}?si=abc`), linkedId);
  assert.equal(window.youtubeApi.extractVideoId(`https://youtube.com/shorts/${linkedId}`), linkedId);
  assert.equal(window.youtubeApi.extractVideoId(`https://youtube.com/embed/${linkedId}`), linkedId);
  assert.equal(window.youtubeApi.extractVideoId(`https://youtube.com/live/${linkedId}?feature=share`), linkedId);
  assert.equal(window.youtubeApi.extractVideoId("https://youtube.com/watch?v=invalido"), null);
  assert.equal(window.youtubeApi.extractVideoId("https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ"), null);

  const exact = await window.youtubeApi.searchVideos(`https://youtu.be/${linkedId}`, 8);
  assert.match(requestedUrl, /^https:\/\/www\.youtube\.com\/oembed\?/);
  assert.match(requestedUrl, new RegExp(encodeURIComponent(linkedId)));
  assert.equal(exact.length, 1);
  assert.equal(exact[0].title, "Vídeo exato");
  assert.equal(exact[0].youtubeVideoId, linkedId);
  assert.equal(exact[0].youtubeChannelTitle, "Canal exato");

  rejectOembed = true;
  const fallback = await window.youtubeApi.searchVideos(`youtube.com/shorts/${linkedId}?feature=share`, 8);
  assert.equal(fallback.length, 1);
  assert.equal(fallback[0].title, "Vídeo do YouTube");
  assert.equal(fallback[0].youtubeVideoId, linkedId);
  assert.equal(fallback[0].youtubeUrl, `https://www.youtube.com/watch?v=${linkedId}`);
  assert.equal(fallback[0].coverUrl, `https://i.ytimg.com/vi/${linkedId}/hqdefault.jpg`);

  rejectOembed = false;
  responseVideos = [{ videoId: "abc", title: "Canção", channelTitle: "Canal" }];
  window.location.hostname = "deploy-preview-40--simplificandocifras.netlify.app";
  window.document.querySelector = () => ({ content: "https://simplificandocifras-production.up.railway.app" });
  await window.youtubeApi.searchVideos("Outra canção", 5);
  assert.match(requestedUrl, /^https:\/\/simplificandocifras-production\.up\.railway\.app\/api\/youtube\/search\?/);
  console.log("youtube-api.test.js: OK");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
