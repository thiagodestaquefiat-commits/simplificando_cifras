// MANUTENÇÃO: Perfil de recomendação das músicas da biblioteca (gênero, subgênero, BPM, temas, sacra),
// MANUTENÇÃO: vindo do catálogo compartilhado (/api/shared-songs/profiles). Só leitura e só em memória.
// MANUTENÇÃO: Sem login ou offline, as sugestões continuam funcionando só pelo tema da letra.
(function (global) {
  "use strict";

  const CHUNK = 300;
  const profiles = new Map();
  const asked = new Set();
  let inflight = null;

  function normalize(value) {
    return String(value || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
      .replace(/[^a-z0-9]+/g, " ").trim();
  }

  function keyOf(song) {
    if (!song) return "";
    return [normalize(song.title), normalize(song.artist), String(song.originalKey || song.key || "").trim()].join("|");
  }

  function get(song) {
    return profiles.get(keyOf(song)) || null;
  }

  async function prefetch(songs, onUpdate) {
    const token = global.appAuth && global.appAuth.getAccessToken && global.appAuth.getAccessToken();
    if (!token || !global.apiConfig || global.navigator?.onLine === false) return false;
    if (inflight) return inflight;
    const missing = [];
    (Array.isArray(songs) ? songs : []).forEach((song) => {
      const key = keyOf(song);
      if (key && !key.startsWith("|") && !asked.has(key)) { asked.add(key); missing.push(song); }
    });
    if (!missing.length) return false;
    inflight = (async () => {
      let changed = false;
      for (let start = 0; start < missing.length; start += CHUNK) {
        const part = missing.slice(start, start + CHUNK);
        try {
          const response = await global.fetch(global.apiConfig.sharedSongsEndpoint("profiles"), {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ items: part.map((song) => ({ title: song.title, artist: song.artist || "", key: song.originalKey || song.key || "" })) })
          });
          if (!response.ok) { part.forEach((song) => asked.delete(keyOf(song))); break; }
          const body = await response.json();
          (body.profiles || []).forEach((profile, index) => {
            if (profile) { profiles.set(keyOf(part[index]), profile); changed = true; }
          });
        } catch (_error) {
          part.forEach((song) => asked.delete(keyOf(song)));
          break;
        }
      }
      return changed;
    })().finally(() => { inflight = null; });
    const changed = await inflight;
    if (changed && typeof onUpdate === "function") onUpdate();
    return changed;
  }

  function clear() { profiles.clear(); asked.clear(); }

  global.songProfiles = Object.freeze({ get, prefetch, clear, keyOf });
})(typeof window !== "undefined" ? window : globalThis);
