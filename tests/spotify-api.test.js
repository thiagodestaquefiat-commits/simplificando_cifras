const assert = require("node:assert/strict");

let requestedUrl = null;
let requestedOptions = null;
const requests = [];

global.window = {
  spotifyAuth: {
    async getAccessToken() { return "access-token"; }
  },
  async fetch(url, options) {
    requestedUrl = url;
    requestedOptions = options;
    requests.push({ url, options });
    if (url.includes("/me/player")) {
      return { ok: true, status: 204 };
    }
    return {
      ok: true,
      status: 200,
      async json() {
        return {
          tracks: {
            items: [{
              id: "track-1",
              name: "Oceans",
              uri: "spotify:track:track-1",
              duration_ms: 503123,
              artists: [{ name: "Hillsong UNITED" }],
              album: {
                name: "Zion",
                images: [{ url: "https://example.test/cover.jpg" }]
              },
              external_ids: { isrc: "AUABC1234567" }
            }]
          }
        };
      }
    };
  }
};

require("../js/spotify-api.js");

(async () => {
  const tracks = await window.spotifyApi.searchTracks("Oceans Hillsong", 10);
  assert.equal(tracks.length, 1);
  assert.deepEqual(tracks[0], {
    title: "Oceans",
    artist: "Hillsong UNITED",
    album: "Zion",
    duration: 503123,
    coverUrl: "https://example.test/cover.jpg",
    spotifyTrackId: "track-1",
    spotifyUri: "spotify:track:track-1",
    isrc: "AUABC1234567",
    key: "",
    capo: "",
    blocos: []
  });
  assert.match(requestedUrl, /^https:\/\/api\.spotify\.com\/v1\/search\?/);
  assert.match(requestedUrl, /type=track/);
  assert.equal(requestedOptions.headers.Authorization, "Bearer access-token");
  await window.spotifyApi.transferPlayback("device-1");
  await window.spotifyApi.startPlayback("device-1", "spotify:track:track-1", 15000);
  await window.spotifyApi.resumePlayback("device-1");
  await window.spotifyApi.seekPlayback("device-1", 30000);
  await window.spotifyApi.setRepeatMode("device-1", true);
  assert.equal(requests[1].url, "https://api.spotify.com/v1/me/player");
  assert.equal(requests[1].options.method, "PUT");
  assert.deepEqual(JSON.parse(requests[1].options.body), { device_ids: ["device-1"], play: false });
  assert.match(requests[2].url, /\/me\/player\/play\?device_id=device-1$/);
  assert.equal(requests[2].options.method, "PUT");
  assert.deepEqual(JSON.parse(requests[2].options.body), { uris: ["spotify:track:track-1"], position_ms: 15000 });
  assert.equal(requests[2].options.headers.Authorization, "Bearer access-token");
  assert.match(requests[3].url, /\/me\/player\/play\?device_id=device-1$/);
  assert.equal(requests[3].options.body, undefined);
  assert.match(requests[4].url, /\/me\/player\/seek\?device_id=device-1&position_ms=30000$/);
  assert.equal(requests[4].options.method, "PUT");
  assert.match(requests[5].url, /\/me\/player\/repeat\?state=track&device_id=device-1$/);
  assert.equal(requests[5].options.method, "PUT");
  console.log("spotify-api.test.js: OK");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
