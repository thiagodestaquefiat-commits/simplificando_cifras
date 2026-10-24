// Reuses ROUDY's existing action sheets and people-search components. Invitations
// only confer access after explicit acceptance, whether from the inbox or a link.
(function (global) {
  'use strict';
  const esc = value => global.eventEsc(String(value ?? ''));
  const byId = id => document.getElementById(id);
  const account = () => global.appAuth?.getState?.().authenticated ? global.appAuth.getState().user.id : null;
  const owner = () => global.homePlaylists.ownerId;
  let layer, previousFocus, sequence = 0, searchTimer, activeId, results = [], query = '', offset = null, linkPrompt = null;
  const api = () => global.playlistCollaboration;
  function close() {
    ++sequence; clearTimeout(searchTimer); layer?.remove(); layer = null;
    previousFocus?.isConnected && previousFocus.focus({ preventScroll: true });
  }
  function mount(markup, title, search = false) {
    const focus = document.activeElement; close(); previousFocus = focus;
    layer = document.createElement('div'); layer.id = 'playlist-invite-layer';
    layer.className = search ? 'event-people-search-layer is-open' : 'home-playlist-action-layer is-open';
    layer.innerHTML = search ? markup : `<button class="home-playlist-action-scrim" type="button" aria-label="Fechar convite"></button><section class="home-playlist-action-sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}"><i class="home-playlist-action-handle" aria-hidden="true"></i>${markup}</section>`;
    layer.addEventListener('click', event => { if (event.target === layer || event.target.closest('.home-playlist-action-scrim,[data-playlist-close]')) close(); });
    layer.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
      if (event.key === 'Tab') {
        const controls = [...layer.querySelectorAll('button:not(:disabled),input,a[href]')].filter(node => !node.hidden && node.getClientRects().length);
        const first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    });
    document.body.appendChild(layer); layer.querySelector('input,button:not(.home-playlist-action-scrim)')?.focus({ preventScroll: true });
    return layer;
  }
  function status(message) { const node = byId('playlist-invite-status'); if (node) node.textContent = message; }
  function avatar(user) { return user.avatarUrl ? `<img src="${esc(user.avatarUrl)}" alt="" referrerpolicy="no-referrer">` : esc(String(user.name || '?').charAt(0)); }
  function open(id) {
    const playlist = global.userPlaylists.get(owner(), id);
    if (!playlist) return;
    if (!account()) { global.showToast('Entre com sua conta para convidar colaboradores.'); return; }
    activeId = id;
    const markup = `<header class="event-people-search-header"><button class="event-people-search-cancel" type="button" data-playlist-close>Cancelar</button><h2 class="event-people-search-title">Convidar para playlist</h2><span></span></header><h3>${esc(playlist.name)}</h3><p>Quem aceitar terá os mesmos direitos que você: editar, adicionar e remover músicas, convidar pessoas e excluir esta playlist para todos.</p><div class="event-invite-actions"><button type="button" class="event-invite-action" data-playlist-search><i><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/></svg></i><span>Buscar</span></button><button type="button" class="event-invite-action" data-playlist-link><i><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 15 6-6M8 17l-2 2a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m2-1 2-2a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0"/></svg></i><span>Compartilhar</span></button><button type="button" class="event-invite-action" data-playlist-qr><i><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3h6v6H3zm12 0h6v6h-6zM3 15h6v6H3zm12 0h3v3h-3zm3 3h3v3h-3z"/></svg></i><span>Escanear QR</span></button><button type="button" class="event-invite-action" data-playlist-copy><i><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg></i><span>Mais</span></button></div><p id="playlist-invite-status" role="status" aria-live="polite"></p>${playlist.collaboration?.blocked ? '<div class="user-invite-panel"><h3>Há ajustes aguardando revisão</h3><p>Os mesmos dados foram alterados por outra pessoa, ou a playlist foi excluída. Preserve seus ajustes em uma cópia pessoal e carregue a versão compartilhada.</p><button class="btn btn-primary" type="button" data-playlist-recover>Preservar cópia e atualizar</button></div>' : ''}`;
    const host = mount(markup, 'Convidar para playlist');
    host.querySelector('[data-playlist-search]').onclick = () => search(id);
    host.querySelector('[data-playlist-link]').onclick = event => share(id, event.currentTarget);
    host.querySelector('[data-playlist-copy]').onclick = event => share(id, event.currentTarget, true);
    host.querySelector('[data-playlist-qr]').onclick = () => {
      close(); global.eventQrScanner.open('playlist:' + id, { onIdentity: async identity => {
        const captured = account(); const body = await global.eventCollaboration.searchUsers(identity.replace(/^@+/, ''), 0);
        if (captured !== account()) throw new Error('A conta ativa mudou.');
        const term = identity.replace(/^@+/, '').toLowerCase(), user = (body.users || []).find(user => user.id === identity || String(user.username || '').toLowerCase() === term);
        if (!user) throw new Error('Não encontramos o perfil deste QR Code.');
        if (!global.appConfirm(`Convidar ${user.name} com os mesmos direitos na playlist?`)) throw new Error('Convite cancelado.');
        await api().invite(id, user.id); return user;
      } });
    };
    host.querySelector('[data-playlist-recover]')?.addEventListener('click', async event => {
      event.currentTarget.disabled = true;
      try { await api().resolveConflict(id, true); close(); global.showToast('Ajustes preservados em uma cópia pessoal. Playlist compartilhada atualizada.'); }
      catch (error) { status(error.message); event.target.disabled = false; }
    });
  }
  async function share(id, button, copyOnly = false) {
    const captured = account(), gen = sequence; button.disabled = true; status('Preparando convite…');
    try {
      const invitation = await api().invite(id);
      if (captured !== account() || gen !== sequence) return;
      const url = new URL(location.href); url.search = ''; url.hash = ''; url.searchParams.set('playlistInvite', invitation.token);
      const title = global.userPlaylists.get(owner(), id).name;
      if (!copyOnly && navigator.share) await navigator.share({ title, text: 'Colabore comigo nesta playlist do ROUDY:', url: url.toString() });
      else {
        try { await navigator.clipboard.writeText(url.toString()); status('Link copiado. Ele expira em 7 dias e aceita uma pessoa.'); }
        catch (_) {
          const field = document.createElement('input'); field.readOnly = true; field.value = url.toString(); field.className = 'event-people-search-input'; field.setAttribute('aria-label', 'Link do convite');
          byId('playlist-invite-status').replaceChildren(field); field.select();
        }
      }
    } catch (error) { if (gen === sequence && error.name !== 'AbortError') status(error.message); }
    finally { button.disabled = false; }
  }
  function search(id) {
    activeId = id; results = []; query = ''; offset = null;
    const host = mount(`<section class="event-people-search-sheet" role="dialog" aria-modal="true" aria-label="Compartilhar playlist com uma pessoa"><i class="event-people-search-handle" aria-hidden="true"></i><header class="event-people-search-header"><button class="event-people-search-cancel" type="button" data-playlist-close>Cancelar</button><h2 class="event-people-search-title">Compartilhar com</h2><span></span></header><label class="event-people-search-box"><input id="playlist-people-query" class="event-people-search-input" type="search" placeholder="Buscar" aria-label="Buscar por nome ou nome de usuário"></label><div class="event-people-search-body"><h3 class="event-people-search-heading">Pessoas</h3><p id="playlist-invite-status" class="event-people-search-status" role="status" aria-live="polite">Busque por nome ou @nome_de_usuario.</p><div id="playlist-people-results"></div><button type="button" class="event-people-search-more-button" id="playlist-people-more" hidden>Mostrar mais</button></div></section>`, 'Compartilhar com', true);
    host.querySelector('input').oninput = event => {
      clearTimeout(searchTimer); ++sequence; query = event.target.value.trim(); results = []; offset = null; renderResults();
      status(query.replace(/^@+/, '').length < 2 ? 'Digite pelo menos 2 caracteres.' : 'Buscando…');
      if (query.replace(/^@+/, '').length >= 2) searchTimer = setTimeout(() => find(0), 300);
    };
    byId('playlist-people-more').onclick = () => find(offset);
    host.querySelector('.event-people-search-box').insertAdjacentHTML('afterbegin', '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="7"/><path d="m16 16 5 5"/></svg>');
  }
  async function find(start) {
    const gen = ++sequence, captured = account(), term = query;
    try {
      const body = await global.eventCollaboration.searchUsers(term, start || 0);
      if (gen !== sequence || captured !== account() || !byId('playlist-people-results')) return;
      const members = new Set(global.userPlaylists.get(owner(), activeId)?.collaboration?.members?.map(member => member.id) || []);
      const users = (body.users || []).filter(user => !members.has(user.id));
      results = start ? results.concat(users) : users; offset = body.nextOffset ?? null; renderResults();
      status(results.length ? 'Selecione uma pessoa para ver o perfil e convidar.' : 'Nenhuma pessoa encontrada.');
    } catch (error) { if (gen === sequence) status(error.message); }
  }
  function renderResults() {
    const target = byId('playlist-people-results'); if (!target) return;
    target.innerHTML = results.map((user, index) => `<button type="button" class="event-people-search-result" data-playlist-user="${index}"><span class="event-people-search-avatar">${avatar(user)}</span><span class="event-people-search-copy"><strong>${esc(user.name)}</strong><small>${user.username ? '@' + esc(user.username) : 'Perfil ROUDY'}</small></span><span class="event-people-search-more" aria-hidden="true">›</span></button>`).join('');
    target.querySelectorAll('[data-playlist-user]').forEach(button => button.onclick = () => profile(results[Number(button.dataset.playlistUser)]));
    byId('playlist-people-more').hidden = offset === null;
  }
  function profile(user) {
    const id = activeId;
    const details = [user.location, (user.instruments || []).join(', ')].filter(Boolean).join(' · ');
    const host = mount(`<header class="playlist-invite-profile-header"><button class="event-people-search-cancel" data-playlist-close type="button">Cancelar</button><h2>Convidar</h2><span aria-hidden="true"></span></header><div class="playlist-invite-profile-person"><span class="playlist-invite-profile-avatar">${avatar(user)}</span><div class="playlist-invite-profile-identity"><h3>${esc(user.name)}</h3>${user.username ? `<p>@${esc(user.username)}</p>` : ''}${details ? `<p class="playlist-invite-profile-details">${esc(details)}</p>` : ''}</div></div><p class="playlist-invite-profile-permissions" id="playlist-invite-permissions">Após aceitar, poderá editar, convidar pessoas e excluir esta playlist, assim como você.</p><button type="button" class="playlist-invite-profile-submit" id="playlist-send-invite" aria-describedby="playlist-invite-permissions">Enviar convite</button><p id="playlist-invite-status" class="playlist-invite-profile-status" role="status" aria-live="polite"></p>`, 'Convidar colaborador');
    host.querySelector('.home-playlist-action-sheet').classList.add('playlist-invite-profile');
    host.querySelector('#playlist-send-invite').onclick = async event => {
      const gen = sequence; event.target.disabled = true;
      try {
        await api().invite(id, user.id);
        // Only dismiss the screen that submitted this invitation. A late
        // response must not close a newer dialog or a different account's UI.
        if (gen === sequence) { close(); global.showToast('Convite enviado. A pessoa entrará após aceitar.'); }
      }
      catch (error) { if (gen === sequence) { status(error.message); event.target.disabled = false; } }
    };
  }
  function renderInbox() {
    const target = byId('playlist-invitations-list'); if (!target) return;
    const invitations = api().getInbox().invitations;
    const eventStatus = byId('user-invitations-status');
    if (eventStatus) eventStatus.hidden = Boolean(invitations.length && !global.eventUserInvites?.getPending?.().length);
    target.innerHTML = invitations.map((item, index) => `<section class="user-invite-panel"><h3>${esc(item.playlistName)}</h3><p>${esc(item.inviter.name)} convidou você para colaborar nesta playlist.</p><small>Ao aceitar, você poderá editar, convidar pessoas e excluir esta playlist para todos.</small><div class="user-invite-actions"><button type="button" class="btn btn-primary" data-playlist-invitation="${index}" data-response="accept">Aceitar</button><button type="button" class="btn btn-outline" data-playlist-invitation="${index}" data-response="reject">Rejeitar</button></div><p role="status" aria-live="polite"></p></section>`).join('');
    target.querySelectorAll('[data-playlist-invitation]').forEach(button => button.onclick = async () => {
      const item = invitations[Number(button.dataset.playlistInvitation)], card = button.closest('section'), action = button.dataset.response;
      card.querySelectorAll('button').forEach(node => node.disabled = true);
      try { const playlist = await api().respond(item.id, action); if (playlist) openPlaylist(playlist.id); else global.showToast('Convite rejeitado.'); }
      catch (error) { card.querySelector('[role=status]').textContent = error.message; card.querySelectorAll('button').forEach(node => node.disabled = false); }
    });
  }
  function openPlaylist(id) {
    close(); global.closeModal(); global.roudySearchMenu?.close();
    if (byId('view-detail') && getComputedStyle(byId('view-detail')).display !== 'none') global.closeDetail();
    if (byId('view-sd') && getComputedStyle(byId('view-sd')).display !== 'none') global.closeSD();
    global.switchTab('musicas'); global.homePlaylists.open(id);
  }
  function openNotice(item) {
    const playlist = global.userPlaylists.list(owner()).find(p => p.collaboration?.id === item.playlistId);
    if (playlist) openPlaylist(playlist.id); else global.showToast(item.summary || 'A playlist foi excluída.');
  }
  async function checkLink() {
    const token = new URL(location.href).searchParams.get('playlistInvite');
    if (!token || linkPrompt === token) return;
    linkPrompt = token;
    try {
      const preview = await api().preview(token);
      const host = mount(`<h2>Convite para playlist</h2><h3>${esc(preview.playlistName)}</h3><p>${esc(preview.inviter.name)} convidou você. Ao aceitar, terá os mesmos direitos de edição e exclusão que os demais integrantes.</p><button class="btn btn-primary" type="button" data-accept-link>${account() ? 'Aceitar convite' : 'Entrar para aceitar'}</button><button class="btn btn-outline" type="button" data-playlist-close>Agora não</button><p id="playlist-invite-status" role="status" aria-live="polite"></p>`, 'Convite para playlist');
      host.querySelector('[data-accept-link]').onclick = async event => {
        if (!account()) { linkPrompt = null; close(); global.openAccountModal(); return; }
        event.target.disabled = true;
        try {
          const playlist = await api().respond(token, 'accept', true);
          const url = new URL(location.href); url.searchParams.delete('playlistInvite'); history.replaceState(history.state, '', url);
          openPlaylist(playlist.id); global.showToast('Convite aceito. Vocês já podem editar a mesma playlist.');
        } catch (error) { status(error.message); event.target.disabled = false; }
      };
    } catch (error) { global.showToast(error.message); }
  }
  global.playlistInvites = Object.freeze({ open, close, search, renderInbox, openNotice, checkLink });
  api().subscribe(renderInbox);
  global.appAuth?.subscribe?.(() => { close(); linkPrompt = null; setTimeout(checkLink, 300); });
  global.addEventListener('DOMContentLoaded', checkLink, { once: true });
})(window);
