// Live playlist cache + durable outbox. Never inject remote songs into a personal
// library. Account guards reject responses from requests started before switching users.
(function (global) {
  'use strict';
  const repo = () => global.userPlaylists;
  const authOwner = () => global.appAuth?.getState?.().authenticated ? String(global.appAuth.getState().user.id) : null;
  const localOwner = () => String(global.homePlaylists?.ownerId || 'local');
  const clone = value => JSON.parse(JSON.stringify(value));
  const uid = () => global.crypto.randomUUID();
  let inbox = { invitations: [], notifications: [] }, inboxOwner = null, busy = false, timer, generation = 0, receiving = false, cursor = null;
  const listeners = new Set();
  const ui = () => { listeners.forEach(fn => fn()); global.notificationCenter?.update(); global.homePlaylists?.refreshCollaboration?.(); };
  function guard(account, owner, gen) { if (account !== authOwner() || owner !== localOwner() || gen !== generation) throw new Error('A conta ativa mudou.'); }
  async function request(path, options = {}) {
    const token = global.appAuth?.getAccessToken?.();
    if (!token) throw new Error('Entre com sua conta para colaborar em playlists.');
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await global.fetch(global.apiConfig.API_BASE_URL + '/api/collaborative-playlists' + path, { ...options, signal: controller.signal, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token } });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw Object.assign(new Error(body.erro?.mensagem || (response.status === 404 ? 'A colaboração de playlists ainda não está disponível neste servidor.' : 'Não foi possível atualizar a playlist.')), { status: response.status });
      return body;
    } finally { clearTimeout(timeout); }
  }
  function snapshot(playlist) {
    const values = typeof musicas !== 'undefined' ? musicas : global.musicas || [];
    return { name: playlist.name, description: playlist.description || '', coverImage: playlist.coverImage || null, items: playlist.items.map(item => {
      const source = item.song || values.find(song => String(song.id) === String(item.songId));
      if (!source) throw new Error('Uma música está indisponível. Remova-a ou recupere-a antes de convidar.');
      const song = clone(source);
      // Personal synchronization metadata never belongs in a shared document.
      for (const key of ['librarySync', 'privateSource', 'ownerId', 'accountId', 'accessToken', 'email', 'phone']) delete song[key];
      return { id: item.id, song, playback: clone(item.playback || {}), notes: item.notes || '' };
    }) };
  }
  function prepare(before, after) {
    const base = snapshot(before), data = snapshot(after), deleted = Boolean(after.collaboration.deleted);
    if (JSON.stringify(base) === JSON.stringify(data) && !deleted) return after;
    const pending = before.collaboration.pending || [];
    return { ...after, collaboration: { ...before.collaboration, deleted, pending: [...pending, { operationId: uid(), baseVersion: before.collaboration.version, base, data, ...(deleted ? { delete: true } : {}) }] } };
  }
  function write(owner, value) {
    receiving = true;
    try { if (!repo().replace(owner, value)) throw new Error('Não foi possível guardar a playlist neste dispositivo.'); }
    finally { receiving = false; }
  }
  function receive(remote, owner = localOwner(), acknowledged) {
    const current = repo().all(owner).find(p => p.collaboration?.id === remote.id);
    let pending = current?.collaboration.pending || [];
    if (acknowledged) pending = pending.filter(op => op.operationId !== acknowledged);
    if (current && remote.version < current.collaboration.version) {
      if (acknowledged) write(owner, { ...current, collaboration: { ...current.collaboration, pending } });
      cursor = null; schedule(); return;
    }
    // Deletion queued after our own edits must use the revision those edits obtained.
    if (acknowledged && pending[0]?.delete) pending = [{ ...pending[0], baseVersion: remote.version }, ...pending.slice(1)];
    const collaboration = { id: remote.id, version: remote.version, members: remote.members, deleted: remote.deleted, pending, blocked: current?.collaboration.blocked || false };
    // Never replace an unacknowledged local draft with a polling response.
    if (pending.length) { write(owner, { ...current, collaboration: { ...collaboration, deleted: current.collaboration.deleted } }); return; }
    const id = current?.id || 'collab_' + remote.id;
    const items = remote.data.items.map(item => ({ ...item, songId: `cpl_${remote.id}_${item.id}` }));
    write(owner, { ...remote.data, id, items, pinned: current?.pinned || false, collaboration: { ...collaboration, blocked: false }, createdAt: remote.createdAt, updatedAt: remote.updatedAt });
  }
  async function promote(id) {
    const account = authOwner(), owner = localOwner(), gen = generation;
    if (!account) throw new Error('Entre com sua conta para convidar colaboradores.');
    const playlist = repo().get(owner, id);
    if (!playlist) throw new Error('Playlist não encontrada.');
    if (playlist.collaboration) return playlist;
    const base = snapshot(playlist);
    const body = await request('', { method: 'POST', body: JSON.stringify({ clientId: id, data: base }) });
    guard(account, owner, gen);
    const latest = repo().get(owner, id);
    if (!latest) throw new Error('A playlist foi removida durante a criação do convite.');
    if (latest.collaboration) return latest;
    const bound = { ...latest, items: latest.items.map(item => ({ ...item, song: item.song || base.items.find(i => i.id === item.id)?.song })), collaboration: { id: body.playlist.id, version: body.playlist.version, members: body.playlist.members, pending: [] } };
    // Preserve edits made while the initial upload was in flight.
    const previous = { ...playlist, collaboration: bound.collaboration };
    const prepared = prepare(previous, bound);
    write(owner, prepared);
    ui(); schedule();
    return prepared;
  }
  async function flush() {
    if (busy || !authOwner() || global.navigator.onLine === false) return;
    busy = true;
    const account = authOwner(), owner = localOwner(), gen = generation;
    try {
      for (const playlist of repo().all(owner).filter(p => p.collaboration)) {
        for (;;) {
          guard(account, owner, gen);
          const current = repo().all(owner).find(p => p.id === playlist.id);
          const op = current?.collaboration.pending?.[0];
          if (!op || current.collaboration.blocked) break;
          try {
            const body = await request('/' + encodeURIComponent(current.collaboration.id) + '/operations', { method: 'POST', body: JSON.stringify(op) });
            guard(account, owner, gen);
            receive(body.playlist, owner, op.operationId);
          } catch (error) {
            guard(account, owner, gen);
            if ([400, 403, 404, 409, 410, 413, 422].includes(error.status)) {
              const saved = repo().all(owner).find(p => p.id === playlist.id);
              write(owner, { ...saved, collaboration: { ...saved.collaboration, deleted: false, blocked: true, error: error.message } });
              global.showToast?.('Há ajustes da playlist aguardando revisão. Abra o botão + da playlist.');
            }
            throw error;
          }
        }
      }
    } finally { busy = false; }
  }
  async function refresh(showError = false) {
    const account = authOwner(), owner = localOwner(), gen = generation;
    if (!account || navigator.onLine === false) return;
    try {
      try { await flush(); } catch (error) { if (showError) global.showToast?.(error.message); }
      guard(account, owner, gen);
      const body = await request(cursor ? '?since=' + encodeURIComponent(cursor) : '');
      guard(account, owner, gen);
      if (body.unchanged) return;
      for (const remote of body.playlists || []) receive(remote, owner);
      inbox = { invitations: body.invitations || [], notifications: body.notifications || [] }; inboxOwner = account;
      cursor = body.cursor || null;
      ui();
    } catch (error) { if (showError && account === authOwner()) global.showToast?.(error.message); }
  }
  function schedule() { if (!receiving) { clearTimeout(timer); timer = setTimeout(() => refresh(), 400); } }
  async function invite(id, recipientId) {
    const account = authOwner(), owner = localOwner(), gen = generation, playlist = await promote(id);
    guard(account, owner, gen);
    const result = await request('/' + encodeURIComponent(playlist.collaboration.id) + '/invitations', { method: 'POST', body: JSON.stringify(recipientId ? { recipientId } : {}) });
    guard(account, owner, gen);
    return result;
  }
  async function respond(id, action, link = false) {
    const account = authOwner(), owner = localOwner(), gen = generation;
    const body = await request('/invitations/' + encodeURIComponent(id) + '/' + action, { method: 'POST', body: JSON.stringify({ link }) });
    guard(account, owner, gen);
    if (body.playlist) receive(body.playlist, owner);
    await refresh();
    return body.playlist && repo().all(owner).find(p => p.collaboration?.id === body.playlist.id);
  }
  async function readNotice(item) {
    await request('/notifications/' + encodeURIComponent(item.id.slice('playlist:'.length)) + '/read', { method: 'POST' });
    const current = inbox.notifications.find(n => n.id === item.id); if (current) current.unread = false;
  }
  async function resolveConflict(id, keepLocalCopy) {
    const account = authOwner(), owner = localOwner(), gen = generation, current = repo().all(owner).find(p => p.id === id);
    if (!current?.collaboration.blocked) return;
    if (keepLocalCopy) {
      const copy = repo().create(owner, current.name + ' (ajustes recuperados)', current.items, { description: current.description, coverImage: current.coverImage });
      if (!copy) throw new Error('Não foi possível preservar a cópia local.');
    }
    const body = await request(''); guard(account, owner, gen);
    const remote = body.playlists?.find(p => p.id === current.collaboration.id);
    if (!remote) {
      if (!keepLocalCopy) throw new Error('Preserve uma cópia antes de remover o vínculo indisponível.');
      write(owner, { ...current, collaboration: { ...current.collaboration, pending: [], blocked: false, deleted: true } });
      ui(); return;
    }
    write(owner, { ...current, collaboration: { ...current.collaboration, pending: [], blocked: false } });
    receive(remote, owner); ui();
  }
  global.playlistCollaboration = Object.freeze({ snapshot, prepare, promote, receive, flush, refresh, invite, respond, readNotice, resolveConflict,
    hasPending: () => repo().all(localOwner()).some(p => p.collaboration?.pending?.length),
    preview: token => global.fetch(global.apiConfig.API_BASE_URL + '/api/collaborative-playlists/links/' + encodeURIComponent(token)).then(async response => { const body = await response.json(); if (!response.ok) throw new Error(body.erro?.mensagem || 'Convite inválido.'); return body; }),
    getInbox: () => inboxOwner === authOwner() ? inbox : { invitations: [], notifications: [] }, subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); } });
  repo().subscribe(schedule);
  global.appAuth?.subscribe?.(() => { generation++; cursor = null; inboxOwner = null; inbox = { invitations: [], notifications: [] }; schedule(); });
  global.addEventListener('online', schedule); global.addEventListener('focus', schedule);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) schedule(); });
  setInterval(() => { if (!document.hidden) refresh(); }, 15000);
  schedule();
})(window);
