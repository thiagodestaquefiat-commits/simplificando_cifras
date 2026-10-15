// MANUTENÇÃO: Tela de playlists da aba Home: lista de playlists, "Todas as músicas" (biblioteca),
// MANUTENÇÃO: tela da playlist com tom próprio por música, compartilhamento por link e uso em eventos.
// MANUTENÇÃO: Depende de funções globais do index.html (musicas, openDetail, shiftText, eventEsc...).
(function (global) {
  "use strict";

  const PREFIX = "upl:";
  let view = "home";
  let currentPlaylistId = null;
  let libraryDirty = true;

  const owner = () => (typeof appCurrentUser !== "undefined" && appCurrentUser && appCurrentUser.id) || "local";
  const esc = (value) => global.eventEsc(String(value ?? ""));
  const js = (value) => global.attrJs(value);
  const pane = () => document.getElementById("pane-musicas");
  const songById = (id) => musicas.find((song) => String(song.id) === String(id));
  const toast = (message) => global.showToast && global.showToast(message);

  function baseKey(song) {
    return (song && (song.originalKey || song.key)) || "";
  }

  function itemPlayback(song, item) {
    return { ...((song && song.playbackSettings) || {}), ...((item && item.playback) || {}) };
  }

  function itemKey(song, item) {
    const key = baseKey(song);
    if (!key) return "";
    const semitones = Number(itemPlayback(song, item).semitones) || 0;
    return semitones ? global.shiftText(key, semitones) : key;
  }

  function itemVariant(song, item) {
    return { ...song, playbackSettings: { ...itemPlayback(song, item), video: undefined } };
  }

  function countLabel(count) {
    return count + (count === 1 ? " música" : " músicas");
  }

  function artwork(name) {
    const initials = String(name || "?").trim().split(/\s+/).slice(0, 2).map((part) => part[0] || "").join("").toUpperCase();
    let hash = 0;
    for (const char of String(name || "")) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    return `<span class="home-playlist-art home-playlist-art--${hash % 6}" aria-hidden="true">${esc(initials || "♪")}</span>`;
  }

  // ── Visões da aba Home ──────────────────────────────────────────────
  function setView(next, options = {}) {
    view = next;
    const element = pane();
    if (!element) return;
    element.dataset.homeView = next;
    if (next === "library" && libraryDirty) global.renderMusicas();
    if (next === "playlist") renderPlaylist();
    if (next === "home") renderHome();
    if (!options.keepScroll) global.scrollTo({ top: 0, behavior: "auto" });
  }

  function libraryVisible() {
    const query = document.getElementById("search-music")?.value || "";
    return view === "library" || Boolean(playlistSearchMode) || Boolean(query.trim());
  }

  function markLibraryDirty() {
    libraryDirty = true;
  }

  function libraryRendered() {
    libraryDirty = false;
  }

  function renderHome() {
    const target = document.getElementById("home-playlists-list");
    if (!target) return;
    const playlists = global.userPlaylists.list(owner());
    const total = musicas.length;
    const library = `<button type="button" class="home-playlist-row home-playlist-row--library" onclick="homePlaylists.openLibrary()"><span class="home-playlist-art home-playlist-art--library" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M9 18V5l10-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="16" cy="16" r="3"/></svg></span><span class="home-playlist-copy"><strong>Todas as músicas</strong><small>${esc(countLabel(total))}</small></span><span class="home-playlist-chevron" aria-hidden="true">›</span></button>`;
    const rows = playlists.map((playlist) => {
      const available = playlist.items.filter((item) => songById(item.songId)).length;
      return `<button type="button" class="home-playlist-row" onclick="homePlaylists.open(${js(playlist.id)})">${artwork(playlist.name)}<span class="home-playlist-copy"><strong>${esc(playlist.name)}</strong><small>${esc(countLabel(available))}${playlist.sharedFrom ? " · recebida" : ""}</small></span><span class="home-playlist-chevron" aria-hidden="true">›</span></button>`;
    }).join("");
    const empty = playlists.length ? "" : `<p class="home-playlists-hint">Monte playlists do seu jeito: por estilo (rock, blues, samba…), por ministro ou por evento. Cada música guarda o tom daquela playlist.</p>`;
    target.innerHTML = library + rows + empty;
  }

  // ── Playlist aberta ─────────────────────────────────────────────────
  function renderPlaylist() {
    const target = document.getElementById("home-playlist-view");
    const playlist = currentPlaylistId && global.userPlaylists.get(owner(), currentPlaylistId);
    if (!target) return;
    if (!playlist) { setView("home"); return; }
    const entries = playlist.items.map((item) => ({ item, song: songById(item.songId) }));
    const available = entries.filter((entry) => entry.song);
    const rows = entries.map(({ item, song }, index) => {
      if (!song) return `<div class="home-playlist-song is-missing"><span class="home-playlist-song-copy"><strong>Música indisponível</strong><small>Ela não está mais na sua biblioteca</small></span><button type="button" class="home-playlist-song-more" onclick="homePlaylists.itemMenu(${js(item.id)})" aria-label="Opções">⋯</button></div>`;
      const key = itemKey(song, item);
      const capo = Number(itemPlayback(song, item).capo) || 0;
      return `<div class="home-playlist-song" data-item-id="${esc(item.id)}"><button type="button" class="home-playlist-song-open" onclick="homePlaylists.openSong(${js(item.id)})"><span class="home-playlist-song-index">${index + 1}</span><span class="home-playlist-song-copy"><strong>${esc(song.title)}</strong><small>${esc(song.artist || "Artista não informado")}${capo ? ` · Capo ${capo}` : ""}${item.notes ? ` · ${esc(item.notes)}` : ""}</small></span></button><div class="home-playlist-key" role="group" aria-label="Tom de ${esc(song.title)} nesta playlist"><button type="button" onclick="homePlaylists.shiftKey(${js(item.id)},-1)" aria-label="Descer o tom de ${esc(song.title)}" ${key ? "" : "disabled"}>−</button><output>${esc(key || "—")}</output><button type="button" onclick="homePlaylists.shiftKey(${js(item.id)},1)" aria-label="Subir o tom de ${esc(song.title)}" ${key ? "" : "disabled"}>+</button></div><button type="button" class="home-playlist-song-more" onclick="homePlaylists.itemMenu(${js(item.id)})" aria-label="Opções de ${esc(song.title)}"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg></button></div>`;
    }).join("");
    target.innerHTML = `<header class="home-playlist-header"><button type="button" class="home-playlist-back" onclick="homePlaylists.back()" aria-label="Voltar para as playlists"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg></button>${artwork(playlist.name)}<div class="home-playlist-heading"><h2>${esc(playlist.name)}</h2><small>${esc(countLabel(available.length))}${playlist.sharedFrom ? " · recebida" : ""}</small></div></header>
      <div class="home-playlist-actions"><button type="button" class="home-playlist-play" onclick="homePlaylists.play()" ${available.length ? "" : "disabled"}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10-6.5z"/></svg><span>Tocar</span></button><button type="button" class="home-playlist-chip" onclick="homePlaylists.openAddSongs()"><span aria-hidden="true">＋</span><span>Músicas</span></button><button type="button" class="home-playlist-chip" onclick="homePlaylists.share()"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11m0-11 4 4m-4-4L8 8M5 12v7h14v-7"/></svg><span>Compartilhar</span></button><button type="button" class="home-playlist-chip home-playlist-chip--icon" onclick="homePlaylists.playlistMenu()" aria-label="Mais opções da playlist"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg></button></div>
      <div class="home-playlist-songs">${rows || `<div class="home-playlist-empty"><strong>Playlist vazia</strong><span>Adicione músicas da sua biblioteca. Cada uma fica com o tom desta playlist.</span><button type="button" onclick="homePlaylists.openAddSongs()">Adicionar músicas</button></div>`}</div>`;
  }

  function open(id) {
    currentPlaylistId = String(id);
    setView("playlist");
  }

  function openLibrary() {
    setView("library");
  }

  function back() {
    currentPlaylistId = null;
    setView("home");
  }

  function availableEntries(playlist) {
    return playlist.items.map((item) => ({ item, song: songById(item.songId) })).filter((entry) => entry.song);
  }

  function openSong(itemId, options = {}) {
    const playlist = global.userPlaylists.get(owner(), currentPlaylistId);
    if (!playlist) return;
    const entries = availableEntries(playlist);
    const index = entries.findIndex((entry) => entry.item.id === String(itemId));
    if (index < 0) return;
    const { item, song } = entries[index];
    global.openDetail(song.id, {
      playlistContext: { playlistId: PREFIX + playlist.id, songIds: entries.map((entry) => entry.song.id), currentIndex: index },
      songOverride: itemVariant(song, item),
      userPlaylistItem: { playlistId: playlist.id, itemId: item.id }
    });
    if (options.stage && global.enterStageMode) global.enterStageMode();
  }

  function play() {
    const playlist = global.userPlaylists.get(owner(), currentPlaylistId);
    const first = playlist && availableEntries(playlist)[0];
    if (first) openSong(first.item.id);
  }

  // Usado pela navegação (anterior/próxima) da tela da música.
  function variantForContext(context) {
    if (!context || !String(context.playlistId || "").startsWith(PREFIX)) return null;
    const playlist = global.userPlaylists.get(owner(), String(context.playlistId).slice(PREFIX.length));
    const entry = playlist && availableEntries(playlist)[context.currentIndex];
    return entry ? { song: itemVariant(entry.song, entry.item), item: { playlistId: playlist.id, itemId: entry.item.id } } : null;
  }

  function shiftKey(itemId, direction) {
    const playlist = global.userPlaylists.get(owner(), currentPlaylistId);
    const item = playlist && playlist.items.find((value) => value.id === String(itemId));
    const song = item && songById(item.songId);
    if (!song) return;
    const semitones = (Number(itemPlayback(song, item).semitones) || 0) + (direction < 0 ? -1 : 1);
    const normalized = ((semitones % 12) + 18) % 12 - 6;
    global.userPlaylists.setItemPlayback(owner(), playlist.id, item.id, { semitones: normalized });
    renderPlaylist();
  }

  // Salva tom/capo/BPM… alterados na tela da música, só nesta playlist.
  function saveItemPlayback(context, state) {
    if (!context) return false;
    const playback = {};
    for (const field of global.userPlaylists.PLAYBACK_FIELDS) if (state[field] !== undefined) playback[field] = state[field];
    return Boolean(global.userPlaylists.setItemPlayback(owner(), context.playlistId, context.itemId, playback));
  }

  // ── Criar, renomear, apagar ─────────────────────────────────────────
  function nameSheet(title, value, action) {
    eventAdminSheetState = { type: "field" };
    global.showEventAdminSheet(`${global.eventAdminHeader(title, action)}<label class="home-playlist-name-field"><span>Nome da playlist</span><input id="home-playlist-name" class="form-input" maxlength="120" value="${esc(value)}" placeholder="Ex.: Rock, Blues, Ministro João" onkeydown="if(event.key==='Enter'){event.preventDefault();${action}}"></label>`, title);
    setTimeout(() => document.getElementById("home-playlist-name")?.select(), 80);
  }

  function create(songIds = []) {
    pendingSongIds = songIds;
    nameSheet("Nova playlist", "", "homePlaylists.confirmCreate()");
  }

  let pendingSongIds = [];
  function confirmCreate() {
    const name = document.getElementById("home-playlist-name")?.value.trim();
    if (!name) { toast("Dê um nome para a playlist."); return; }
    const items = pendingSongIds.map((songId) => ({ songId, playback: global.userPlaylists.cleanPlayback(songById(songId)?.playbackSettings) }));
    const playlist = global.userPlaylists.create(owner(), name, items);
    pendingSongIds = [];
    global.closeEventAdminSheet();
    if (!playlist) { toast("Não foi possível criar a playlist."); return; }
    toast(items.length ? `Playlist “${name}” criada.` : `Playlist “${name}” criada. Adicione as músicas.`);
    open(playlist.id);
  }

  function renameCurrent() {
    const playlist = global.userPlaylists.get(owner(), currentPlaylistId);
    if (playlist) nameSheet("Renomear playlist", playlist.name, "homePlaylists.confirmRename()");
  }

  function confirmRename() {
    const name = document.getElementById("home-playlist-name")?.value.trim();
    if (!name) { toast("Dê um nome para a playlist."); return; }
    global.userPlaylists.rename(owner(), currentPlaylistId, name);
    global.closeEventAdminSheet();
    renderPlaylist();
  }

  function menuSheet(title, actions) {
    eventAdminSheetState = { type: "field" };
    global.showEventAdminSheet(`${global.eventAdminHeader(title)}<div class="home-playlist-menu">${actions.map(([label, action, danger]) => `<button type="button" class="${danger ? "is-danger" : ""}" onclick="${action}">${esc(label)}</button>`).join("")}</div>`, title);
  }

  function playlistMenu() {
    const playlist = global.userPlaylists.get(owner(), currentPlaylistId);
    if (!playlist) return;
    menuSheet(playlist.name, [
      ["Renomear", "homePlaylists.renameCurrent()"],
      ["Duplicar", "homePlaylists.duplicateCurrent()"],
      ["Usar em um evento", "homePlaylists.useInEvent()"],
      ["Apagar playlist", "homePlaylists.deleteCurrent()", true]
    ]);
  }

  function duplicateCurrent() {
    const copy = global.userPlaylists.duplicate(owner(), currentPlaylistId);
    global.closeEventAdminSheet();
    if (copy) { toast("Playlist duplicada."); open(copy.id); }
  }

  function deleteCurrent() {
    const playlist = global.userPlaylists.get(owner(), currentPlaylistId);
    global.closeEventAdminSheet();
    if (!playlist || !global.appConfirm(`Apagar a playlist “${playlist.name}”? As músicas continuam na sua biblioteca.`)) return;
    global.userPlaylists.remove(owner(), playlist.id);
    toast("Playlist apagada.");
    back();
  }

  function itemMenu(itemId) {
    const playlist = global.userPlaylists.get(owner(), currentPlaylistId);
    const item = playlist && playlist.items.find((value) => value.id === String(itemId));
    if (!item) return;
    const song = songById(item.songId);
    const index = playlist.items.indexOf(item);
    const actions = [];
    if (index > 0) actions.push(["Mover para cima", `homePlaylists.moveItem(${js(item.id)},-1)`]);
    if (index < playlist.items.length - 1) actions.push(["Mover para baixo", `homePlaylists.moveItem(${js(item.id)},1)`]);
    actions.push(["Observação", `homePlaylists.editNotes(${js(item.id)})`]);
    actions.push(["Tirar da playlist", `homePlaylists.removeItem(${js(item.id)})`, true]);
    menuSheet(song ? song.title : "Música", actions);
  }

  function moveItem(itemId, direction) {
    global.userPlaylists.moveItem(owner(), currentPlaylistId, itemId, direction);
    global.closeEventAdminSheet();
    renderPlaylist();
  }

  function removeItem(itemId) {
    global.userPlaylists.removeItem(owner(), currentPlaylistId, itemId);
    global.closeEventAdminSheet();
    renderPlaylist();
  }

  let notesItemId = null;
  function editNotes(itemId) {
    const playlist = global.userPlaylists.get(owner(), currentPlaylistId);
    const item = playlist && playlist.items.find((value) => value.id === String(itemId));
    if (!item) return;
    notesItemId = item.id;
    eventAdminSheetState = { type: "field" };
    global.showEventAdminSheet(`${global.eventAdminHeader("Observação", "homePlaylists.saveNotes()")}<label class="home-playlist-name-field"><span>Aparece embaixo do nome da música nesta playlist</span><input id="home-playlist-notes" class="form-input" maxlength="500" value="${esc(item.notes)}" placeholder="Ex.: entrada só voz e violão"></label>`, "Observação");
  }

  function saveNotes() {
    const value = document.getElementById("home-playlist-notes")?.value || "";
    global.userPlaylists.setItemNotes(owner(), currentPlaylistId, notesItemId, value);
    global.closeEventAdminSheet();
    renderPlaylist();
  }

  // ── Adicionar músicas ───────────────────────────────────────────────
  let addQuery = "";
  function openAddSongs() {
    addQuery = "";
    eventAdminSheetState = { type: "add", playlistAdd: true };
    global.showEventAdminSheet(`${global.eventAdminHeader("Adicionar músicas")}<div class="event-admin-song-list" id="home-playlist-add-list"></div><label class="event-admin-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="m16 16 5 5"></path></svg><input type="search" placeholder="Buscar na sua biblioteca" aria-label="Buscar música" oninput="homePlaylists.filterAdd(this.value)"></label>`, "Adicionar músicas à playlist");
    renderAddList();
  }

  function filterAdd(value) {
    addQuery = String(value || "").trim().toLocaleLowerCase("pt-BR");
    renderAddList();
  }

  function renderAddList() {
    const target = document.getElementById("home-playlist-add-list");
    const playlist = global.userPlaylists.get(owner(), currentPlaylistId);
    if (!target || !playlist) return;
    const present = new Set(playlist.items.map((item) => String(item.songId)));
    const songs = [...musicas]
      .filter((song) => !addQuery || `${song.title || ""} ${song.artist || ""}`.toLocaleLowerCase("pt-BR").includes(addQuery))
      .sort((a, b) => String(a.title || "").localeCompare(String(b.title || ""), "pt-BR"))
      .slice(0, 120);
    target.innerHTML = songs.map((song) => {
      const added = present.has(String(song.id));
      return `<div class="event-admin-song-row">${global.eventSongArtwork(song)}<span class="event-admin-song-copy"><strong>${esc(song.title)}</strong>${song.artist ? `<small>${esc(song.artist)}</small>` : ""}</span><button type="button" class="event-admin-add-button${added ? " is-added" : ""}" ${added ? "disabled" : ""} onclick="homePlaylists.addSong(${js(song.id)},this)" aria-label="${added ? `${esc(song.title)} já está na playlist` : `Adicionar ${esc(song.title)}`}"><svg class="plus" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M12 7v10M7 12h10"></path></svg><svg class="check" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><path d="m7.5 12 3 3 6-7"></path></svg></button></div>`;
    }).join("") || `<div class="event-admin-empty">${addQuery ? "Nenhuma música encontrada." : "Sua biblioteca está vazia."}</div>`;
  }

  function addSong(songId, button) {
    const song = songById(songId);
    if (!song) return;
    global.userPlaylists.addSong(owner(), currentPlaylistId, song.id, global.userPlaylists.cleanPlayback(song.playbackSettings));
    if (button) { button.disabled = true; button.classList.add("is-added"); }
    renderPlaylist();
  }

  // A partir das opções de uma música da biblioteca.
  function chooseForSong(songId) {
    const playlists = global.userPlaylists.list(owner());
    const song = songById(songId);
    if (!song) return;
    pendingSongIds = [song.id];
    eventAdminSheetState = { type: "field" };
    global.showEventAdminSheet(`${global.eventAdminHeader("Adicionar à playlist")}<div class="home-playlist-menu"><button type="button" onclick="homePlaylists.create(${js([song.id])})">＋ Nova playlist</button>${playlists.map((playlist) => {
      const present = playlist.items.some((item) => String(item.songId) === String(song.id));
      return `<button type="button" ${present ? "disabled" : ""} onclick="homePlaylists.addSongTo(${js(playlist.id)},${js(song.id)})">${esc(playlist.name)}${present ? " · já está" : ""}</button>`;
    }).join("")}</div>`, "Adicionar à playlist");
  }

  function addSongTo(playlistId, songId) {
    const song = songById(songId);
    const playlist = song && global.userPlaylists.addSong(owner(), playlistId, song.id, global.userPlaylists.cleanPlayback(song.playbackSettings));
    global.closeEventAdminSheet();
    if (playlist) toast(`Adicionada em “${playlist.name}”.`);
    if (view === "home") renderHome();
  }

  // ── Eventos: puxar a playlist para o repertório com os tons dela ────
  function useInEvent() {
    const playlist = global.userPlaylists.get(owner(), currentPlaylistId);
    if (!playlist) return;
    const events = (setlists || []).filter((event) => global.eventModel.canEditShared(event, global.eventPermissionActor(event).id));
    menuSheet("Usar em qual evento?", events.length
      ? events.map((event) => [event.title + (event.date ? " · " + global.eventDisplayDate(event.date) : ""), `homePlaylists.addPlaylistToEvent(${js(playlist.id)},${js(event.id)})`])
      : [["Você não lidera nenhum evento ainda", "closeEventAdminSheet()"]]);
  }

  function eventItemsFromPlaylist(playlist, event) {
    const present = new Set(event.repertoire.map((item) => String(item.songId)));
    return availableEntries(playlist).filter(({ song }) => !present.has(String(song.id))).map(({ item, song }, index) => ({
      id: "rep_" + Date.now() + "_" + index + "_" + Math.random().toString(36).slice(2, 6),
      songId: song.id,
      order: event.repertoire.length + index,
      shared: global.eventEditFromSong(global.eventSongCopy(song, itemPlayback(song, item)), item.notes || ""),
      personalEdits: {}
    }));
  }

  function addPlaylistToEvent(playlistId, eventId) {
    const playlist = global.userPlaylists.get(owner(), playlistId);
    let event = global.findEvent(eventId);
    if (!playlist || !event) return;
    if (!global.eventModel.canEditShared(event, global.eventPermissionActor(event).id)) { toast("Somente o líder pode editar o repertório oficial."); return; }
    const items = eventItemsFromPlaylist(playlist, event);
    global.closeEventAdminSheet();
    if (!items.length) { toast("Todas as músicas desta playlist já estão no evento."); return; }
    event = global.eventModel.create({ ...event, repertoire: [...event.repertoire, ...items], syncState: "pending", pendingShared: true });
    event = global.eventModel.withSharedChange(event, global.eventPermissionActor(event), "repertoire.song.added", `adicionou a playlist ${playlist.name} ao repertório oficial`, { changeType: "SONG_ADDED", after: { count: items.length } });
    setlists = global.eventRepository.upsert(setlists, event).events;
    global.eventRepository.save(setlists);
    global.renderSetlists();
    toast(`${items.length} ${items.length === 1 ? "música adicionada" : "músicas adicionadas"} ao evento, nos tons da playlist.`);
    return event;
  }

  // ── Compartilhar por link e salvar na própria conta ─────────────────
  function shareEndpoint(path = "") {
    return global.apiConfig.API_BASE_URL + "/api/shared-playlists" + path;
  }

  async function share() {
    const playlist = global.userPlaylists.get(owner(), currentPlaylistId);
    if (!playlist) return;
    const token = global.appAuth && global.appAuth.getAccessToken && global.appAuth.getAccessToken();
    if (!token) { toast("Entre com sua conta para compartilhar a playlist."); return; }
    const items = availableEntries(playlist).map(({ item, song }) => ({ song: global.songFormat.toLegacy(global.songFormat.fromLegacy(song), song), playback: item.playback, notes: item.notes }));
    if (!items.length) { toast("Adicione músicas antes de compartilhar."); return; }
    toast("Preparando o link…");
    try {
      const response = await global.fetch(shareEndpoint(), { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token }, body: JSON.stringify({ name: playlist.name, description: playlist.description, items }) });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body || !body.id) throw new Error(body?.erro?.mensagem || "Não foi possível compartilhar agora.");
      const url = new URL(global.location.href);
      url.search = "";
      url.hash = "";
      url.searchParams.set("playlist", body.id);
      const text = `Playlist “${playlist.name}” no ROUDY — abra e salve na sua conta:`;
      if (global.navigator.share) await global.navigator.share({ title: playlist.name, text, url: url.toString() }).catch(() => {});
      else if (global.navigator.clipboard) { await global.navigator.clipboard.writeText(text + " " + url.toString()); toast("Link copiado."); }
    } catch (error) {
      toast("⚠️ " + (error.message || "Não foi possível compartilhar agora."));
    }
  }

  let receivedPlaylist = null;
  async function openReceived(sharedId) {
    try {
      const response = await global.fetch(shareEndpoint("/" + encodeURIComponent(sharedId)));
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.playlist) throw new Error(body?.erro?.mensagem || "Playlist não encontrada.");
      receivedPlaylist = { id: body.id, ...body.playlist };
      const songs = receivedPlaylist.items.map((item) => {
        const key = item.song.key || item.song.originalKey || "";
        const semitones = Number(item.playback?.semitones) || 0;
        return `<div class="event-admin-song-row"><span class="event-admin-song-copy"><strong>${esc(item.song.title)}</strong><small>${esc(item.song.artist || "")}${key ? ` · Tom ${esc(semitones ? global.shiftText(key, semitones) : key)}` : ""}</small></span></div>`;
      }).join("");
      eventAdminSheetState = { type: "field" };
      global.showEventAdminSheet(`${global.eventAdminHeader("Playlist recebida", "homePlaylists.saveReceived()")}<div class="home-playlist-received"><h3>${esc(receivedPlaylist.name)}</h3><p>${esc(countLabel(receivedPlaylist.items.length))} · toque em <strong>Guardar</strong> para salvar na sua conta com os mesmos tons.</p></div><div class="event-admin-song-list">${songs}</div>`, "Playlist recebida");
    } catch (error) {
      toast("⚠️ " + (error.message || "Não foi possível abrir a playlist."));
    }
  }

  function identity(song) {
    const clean = (value) => String(value || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("pt-BR").replace(/[^a-z0-9]+/g, " ").trim();
    return clean(song.title) + "|" + clean(song.artist);
  }

  // Salva na conta de quem recebeu: reaproveita músicas iguais da biblioteca e adiciona só as que faltam.
  function saveReceived() {
    const data = receivedPlaylist;
    if (!data) return;
    const byIdentity = new Map(musicas.map((song) => [identity(song), song]));
    const newSongs = [];
    const items = data.items.map((item) => {
      let song = byIdentity.get(identity(item.song));
      if (!song) {
        song = global.songModel.create({ ...item.song, id: "shared_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8), librarySync: undefined, playbackSettings: undefined });
        byIdentity.set(identity(song), song);
        newSongs.push(song);
      }
      return { songId: song.id, playback: item.playback || {}, notes: item.notes || "" };
    });
    if (newSongs.length && !global.commitSongs([...musicas, ...newSongs])) { toast("⚠️ Não foi possível salvar as músicas desta playlist."); return; }
    const playlist = global.userPlaylists.create(owner(), data.name, items, { description: data.description, sharedFrom: data.id });
    global.closeEventAdminSheet();
    receivedPlaylist = null;
    if (!playlist) { toast("⚠️ Não foi possível salvar a playlist."); return; }
    toast(newSongs.length ? `Playlist salva. ${newSongs.length} ${newSongs.length === 1 ? "música nova entrou" : "músicas novas entraram"} na sua biblioteca.` : "Playlist salva na sua conta.");
    global.switchTab && global.switchTab("musicas");
    open(playlist.id);
  }

  function checkSharedLink() {
    try {
      const url = new URL(global.location.href);
      const sharedId = url.searchParams.get("playlist");
      if (!sharedId) return;
      url.searchParams.delete("playlist");
      global.history.replaceState(global.history.state, "", url.toString());
      openReceived(sharedId);
    } catch (_error) {}
  }

  global.homePlaylists = Object.freeze({
    PREFIX, setView, libraryVisible, markLibraryDirty, libraryRendered, renderHome, open, openLibrary, back, openSong, play, variantForContext, shiftKey, saveItemPlayback,
    create, confirmCreate, renameCurrent, confirmRename, playlistMenu, duplicateCurrent, deleteCurrent, itemMenu, moveItem, removeItem, editNotes, saveNotes,
    openAddSongs, filterAdd, addSong, chooseForSong, addSongTo, useInEvent, addPlaylistToEvent, eventItemsFromPlaylist, share, openReceived, saveReceived, checkSharedLink,
    get view() { return view; }, get currentPlaylistId() { return currentPlaylistId; }
  });
})(window);
