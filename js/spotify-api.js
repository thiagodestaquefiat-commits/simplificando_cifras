(function (global) {
  "use strict";

  const API_BASE_URL = "https://api.spotify.com/v1";

  function mapTrack(track) {
    const source = track || {};
    const images = source.album && Array.isArray(source.album.images) ? source.album.images : [];
    return {
      title: source.name || "",
      artist: Array.isArray(source.artists) ? source.artists.map((artist) => artist.name).filter(Boolean).join(", ") : "",
      album: source.album ? source.album.name || null : null,
      duration: Number.isFinite(Number(source.duration_ms)) ? Number(source.duration_ms) : null,
      coverUrl: images[0] ? images[0].url || null : null,
      spotifyTrackId: source.id || null,
      spotifyUri: source.uri || null,
      isrc: source.external_ids ? source.external_ids.isrc || null : null,
      key: "",
      capo: "",
      blocos: []
    };
  }

  async function request(path, options) {
    const accessToken = await global.spotifyAuth.getAccessToken();
    const response = await global.fetch(API_BASE_URL + path, {
      ...(options || {}),
      headers: {
        ...((options && options.headers) || {}),
        Authorization: "Bearer " + accessToken
      }
    });
    const payload = response.status === 204 ? null : await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload && payload.error && payload.error.message
        ? payload.error.message
        : "O Spotify não conseguiu concluir a solicitação.");
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  async function searchTracks(query, limit) {
    const cleaned = String(query || "").trim();
    if (!cleaned) return [];
    const parameters = new URLSearchParams({
      q: cleaned,
      type: "track",
      limit: String(Math.min(Math.max(Number(limit) || 10, 1), 20))
    });
    const payload = await request("/search?" + parameters.toString());
    const items = payload && payload.tracks && Array.isArray(payload.tracks.items) ? payload.tracks.items : [];
    return items.map(mapTrack).filter((track) => track.title && track.spotifyTrackId);
  }

  async function transferPlayback(deviceId) {
    if (!deviceId) throw new TypeError("O dispositivo do player Spotify é obrigatório.");
    return request("/me/player", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ device_ids: [deviceId], play: false })
    });
  }

  async function startPlayback(deviceId, spotifyUri) {
    if (!deviceId) throw new TypeError("O dispositivo do player Spotify é obrigatório.");
    if (!spotifyUri) throw new TypeError("A URI da música Spotify é obrigatória.");
    const parameters = new URLSearchParams({ device_id: deviceId });
    return request("/me/player/play?" + parameters.toString(), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uris: [spotifyUri] })
    });
  }

  async function resumePlayback(deviceId) {
    if (!deviceId) throw new TypeError("O dispositivo do player Spotify é obrigatório.");
    const parameters = new URLSearchParams({ device_id: deviceId });
    return request("/me/player/play?" + parameters.toString(), { method: "PUT" });
  }

  async function setRepeatMode(deviceId, enabled) {
    if (!deviceId) throw new TypeError("O dispositivo do player Spotify é obrigatório.");
    const parameters = new URLSearchParams({ state: enabled ? "track" : "off", device_id: deviceId });
    return request("/me/player/repeat?" + parameters.toString(), { method: "PUT" });
  }

  global.spotifyApi = Object.freeze({ mapTrack, request, searchTracks, transferPlayback, startPlayback, resumePlayback, setRepeatMode });
})(window);
