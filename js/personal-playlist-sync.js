// MANUTENÇÃO: Sincroniza as playlists PESSOAIS com a nuvem (/api/personal-playlists), para aparecerem
// MANUTENÇÃO: em todos os aparelhos da conta (celular, PC...). Playlists colaborativas têm o próprio fluxo.
// MANUTENÇÃO: Cada item vai só com a referência da música (clientId da biblioteca) + tom/ajustes/notas:
// MANUTENÇÃO: a música continua única na biblioteca (que já sincroniza) e a playlist sempre mostra a versão atual.
// MANUTENÇÃO: Regras: alteração local ainda não enviada nunca é trocada pela da nuvem; exclusão em outro
// MANUTENÇÃO: aparelho só remove aqui se a playlist não tinha alteração local pendente.
// MANUTENÇÃO: A nuvem só é apagada por exclusão feita pela pessoa (registrada em userPlaylists.remove).
// MANUTENÇÃO: Playlist ausente no aparelho NUNCA é tratada como excluída: é baixada de volta.
(function (global) {
  "use strict";

    const MAX_COVER = 1_500_000;
  let running = false, again = false, timer = null, applying = false, cursor = null, cursorOwner = null, lastRemoteIds = [];

  const playlists = () => global.userPlaylists;
  const songs = () => (typeof musicas !== "undefined" ? musicas : global.musicas) || []; // eslint-disable-line no-undef
  const ownerId = () => String(global.homePlaylists?.ownerId || "local");
  const account = () => {
    const state = global.appAuth?.getState?.();
    return state?.authenticated && state.user?.id ? String(state.user.id) : null;
  };
  const token = () => global.appAuth?.getAccessToken?.() || null;
  const endpoint = (path = "") => global.apiConfig.API_BASE_URL + "/api/personal-playlists" + path;

  function findSong(ref) {
    const id = String(ref || "");
    if (!id) return null;
    return songs().find((song) => String(song.id) === id) || songs().find((song) => String(song?.librarySync?.clientId || "") === id) || null;
  }

  function cover(value) {
    return typeof value === "string" && value.startsWith("data:image/") && value.length <= MAX_COVER ? value : null;
  }

  // Forma enviada à nuvem.
  function payload(playlist) {
    return {
      name: playlist.name,
      description: playlist.description || "",
      coverImage: cover(playlist.coverImage),
      pinned: Boolean(playlist.pinned),
      createdAt: playlist.createdAt || "",
      updatedAt: playlist.updatedAt || "",
      items: playlist.items.map((item) => {
        const song = findSong(item.songId);
        const songClientId = String(song?.librarySync?.clientId || "");
        return { id: item.id, songClientId, songId: String(song?.id ?? item.songId), title: song?.title || "", artist: song?.artist || "", playback: item.playback || {}, notes: item.notes || "" };
      })
    };
  }

  // Assinatura estável entre aparelhos: ignora ids locais, títulos e datas (que diferem por aparelho).
  function signature(playlist) {
    const data = payload(playlist);
    const items = data.items.map((item) => [item.id, item.songClientId || item.songId, sorted(item.playback), item.notes]);
    return JSON.stringify([data.name, data.description, data.coverImage ? data.coverImage.length + ":" + data.coverImage.slice(-64) : null, data.pinned, items]);
  }
  function sorted(value) {
    return Object.keys(value || {}).sort().map((key) => [key, value[key]]);
  }

  // Playlist da nuvem -> playlist local (aponta para a música da biblioteca deste aparelho).
  function fromRemote(remote, current) {
    const data = remote.data || {};
    const local = {
      id: remote.clientId,
      name: data.name,
      description: data.description || "",
      coverImage: data.coverImage || null,
      pinned: Boolean(data.pinned),
      sharedFrom: current?.sharedFrom || null,
      createdAt: data.createdAt || current?.createdAt || remote.updatedAt,
      updatedAt: data.updatedAt || remote.updatedAt,
      items: (data.items || []).map((item) => {
        const song = findSong(item.songClientId) || findSong(item.songId);
        return { id: item.id, songId: song ? song.id : (item.songClientId || item.songId), playback: item.playback || {}, notes: item.notes || "" };
      })
    };
    return { ...local, cloud: { version: remote.version, signature: signature(local) } };
  }

  // Recuperação única da janela do erro de 24/10 (16:10–18:30 UTC).
  const RECOVERY_KEY = "sc_personal_playlists_recovered_v1";
  const BUG_FROM = Date.parse("2026-10-24T16:10:00Z"), BUG_TO = Date.parse("2026-10-24T18:30:00Z");
  function inBugWindow(remote) { const at = Date.parse(remote.updatedAt || 0) || 0; return at >= BUG_FROM && at <= BUG_TO; }
  function recovered(owner) { return Boolean((global.storage.get(RECOVERY_KEY, {}) || {})[owner]); }
  function markRecovered(owner) { const all = global.storage.get(RECOVERY_KEY, {}) || {}; all[owner] = true; global.storage.set(RECOVERY_KEY, all); }

  async function request(method, path, body) {
    const response = await global.fetch(endpoint(path), {
      method,
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token() },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    const json = await response.json().catch(() => null);
    if (!response.ok && response.status !== 409) {
      const error = new Error(json?.erro?.mensagem || "Não foi possível sincronizar as playlists.");
      error.status = response.status;
      throw error;
    }
    return { status: response.status, body: json };
  }

  function write(owner, playlist) {
    applying = true;
    try { return playlists().replace(owner, playlist); } finally { applying = false; }
  }
  function removeLocal(owner, id) {
    applying = true;
    try { return playlists().remove(owner, id, { fromCloud: true }); } finally { applying = false; }
  }
  function markSynced(owner, playlist, remote) {
    const latest = playlists().all(owner).find((value) => value.id === playlist.id);
    if (!latest) return;
    // Só marca como enviada se ninguém editou enquanto o envio estava em andamento.
    if (signature(latest) !== signature(playlist)) { write(owner, { ...latest, cloud: { ...(latest.cloud || {}), version: remote.version } }); return; }
    write(owner, { ...latest, cloud: { version: remote.version, signature: signature(latest) } });
  }

  async function push(owner, playlist, baseVersion, force) {
    cursor = null;
    const { status, body } = await request("PUT", "/" + encodeURIComponent(playlist.id), { baseVersion: baseVersion ?? null, force: Boolean(force), data: payload(playlist) });
    if (status === 409 && body?.playlist) return { conflict: body.playlist };
    markSynced(owner, playlist, body.playlist);
    return { remote: body.playlist };
  }

  async function syncOnce() {
    const acc = account(), owner = ownerId();
    if (!acc || !token() || !playlists() || global.navigator.onLine === false || owner === "local") return;
    const guard = () => { if (account() !== acc || ownerId() !== owner) throw new Error("conta_alterada"); };
    const pending = playlists().all(owner).some((value) => !value.collaboration && (!value.cloud || value.cloud.signature !== signature(value)))
      || Object.keys(playlists().deletions ? playlists().deletions(owner) : {}).length > 0 || !recovered(owner)
      || lastRemoteIds.some((id) => !playlists().all(owner).some((value) => value.id === id)); // sumiu do aparelho: baixa de novo
    const since = cursorOwner === acc + "|" + owner && cursor && !pending ? "?since=" + encodeURIComponent(cursor) : "";
    const { body } = await request("GET", since);
    guard();
    if (body?.unchanged) return;
    cursor = body?.cursor || null; cursorOwner = acc + "|" + owner;
    lastRemoteIds = (Array.isArray(body?.playlists) ? body.playlists : []).filter((remote) => !remote.deleted).map((remote) => String(remote.clientId));
    const remoteList = Array.isArray(body?.playlists) ? body.playlists : [];
    const remoteById = new Map(remoteList.map((remote) => [String(remote.clientId), remote]));

    const tombs = playlists().deletions ? playlists().deletions(owner) : {};
    let tombsChanged = false;
    const dropTomb = (id) => { if (tombs[id]) { delete tombs[id]; tombsChanged = true; } };
    const recover = !recovered(owner);

    for (const remote of remoteList) {
      guard();
      const id = String(remote.clientId);
      const local = playlists().all(owner).find((value) => value.id === id && !value.collaboration);
      if (!local) {
        const tomb = tombs[id];
        if (tomb) {
          // Apagada pela pessoa neste aparelho: apaga na nuvem, se ninguém mudou lá depois.
          if (remote.deleted) { dropTomb(id); continue; }
          if (tomb.version != null && tomb.version !== remote.version) { dropTomb(id); write(owner, fromRemote(remote)); continue; }
          cursor = null;
          const result = await request("DELETE", "/" + encodeURIComponent(id), { baseVersion: remote.version });
          guard();
          dropTomb(id);
          if (result.status === 409 && result.body?.playlist && !result.body.playlist.deleted) write(owner, fromRemote(result.body.playlist));
          continue;
        }
        if (remote.deleted) {
          // Recuperação (24/10): a primeira versão da sincronização apagava na nuvem playlists que
          // só tinham sumido do aparelho. Restaura uma vez as apagadas nessa janela.
          if (recover && inBugWindow(remote)) {
            const restored = await push(owner, { ...fromRemote(remote), cloud: null }, remote.version, true).catch(() => null);
            guard();
            if (restored?.remote) write(owner, fromRemote(restored.remote));
          }
          continue;
        }
        // Existe na nuvem e não foi apagada aqui: baixa (inclusive se tinha sumido do aparelho).
        write(owner, fromRemote(remote));
        continue;
      }
      dropTomb(id);
      const changedHere = !local.cloud || local.cloud.signature !== signature(local);
      if (remote.deleted) {
        if (local.cloud && !changedHere) { removeLocal(owner, id); continue; }
        await push(owner, local, remote.version, true); // editada aqui depois da exclusão: recria
        continue;
      }
      if (local.cloud?.version === remote.version) {
        if (changedHere) {
          const result = await push(owner, local, remote.version);
          guard();
          if (result.conflict) again = true; // outro aparelho gravou no meio: refaz a comparação
        }
        continue;
      }
      if (!changedHere) { write(owner, fromRemote(remote, local)); continue; }
      // Mudou aqui e em outro aparelho: fica a alteração mais recente.
      const remoteTime = Date.parse(remote.data?.updatedAt || remote.updatedAt || 0) || 0;
      const localTime = Date.parse(local.updatedAt || 0) || 0;
      if (localTime >= remoteTime) await push(owner, local, remote.version, true);
      else write(owner, fromRemote(remote, local));
    }
    // Exclusões de playlists que nem estão mais na nuvem: nada a fazer.
    for (const id of Object.keys(tombs)) if (!remoteById.has(id)) dropTomb(id);
    if (tombsChanged && playlists().setDeletions) playlists().setDeletions(owner, tombs);
    if (recover) markRecovered(owner);

    // Playlists que ainda não estão na nuvem.
    for (const local of playlists().all(owner).filter((value) => !value.collaboration && !remoteById.has(value.id))) {
      guard();
      if (!local.items.length && !local.name) continue;
      try {
        await push(owner, local, null);
      } catch (error) {
        if (error.status === 413 || error.status === 400) console.warn("[playlists] não sincronizada:", local.name, error.message);
        else throw error;
      }
    }
  }

  async function sync() {
    if (running) { again = true; return; }
    running = true;
    try {
      let rounds = 0;
      do { again = false; await syncOnce(); } while (again && ++rounds < 3);
    } catch (error) {
      if (error.message !== "conta_alterada") console.warn("[playlists] sincronização adiada:", error.message || error);
    } finally {
      running = false;
    }
  }

  function schedule(delay = 1500) {
    if (applying) return;
    clearTimeout(timer);
    timer = setTimeout(sync, delay);
  }

  function start() {
    playlists()?.subscribe?.(() => schedule());
    global.appAuth?.subscribe?.(() => schedule(500));
    global.addEventListener("online", () => schedule(500));
    global.addEventListener("focus", () => schedule(500));
    global.document?.addEventListener?.("visibilitychange", () => { if (!global.document.hidden) schedule(500); });
    global.setInterval(() => { if (!global.document?.hidden) schedule(0); }, 60000);
    schedule(2500);
  }

  global.personalPlaylistSync = Object.freeze({ sync, schedule, start, payload, signature, fromRemote });
})(window);
