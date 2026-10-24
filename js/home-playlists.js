// MANUTENÇÃO: Tela de playlists da aba Home: lista de playlists, "Todas as músicas" (biblioteca),
// MANUTENÇÃO: tela da playlist com tom próprio por música, compartilhamento por link e uso em eventos.
// MANUTENÇÃO: Depende de funções globais do index.html (musicas, openDetail, shiftText, eventEsc...).
(function (global) {
  "use strict";

  const PREFIX = "upl:";
  let view = "home";
  let currentPlaylistId = null;
  let libraryDirty = true;
  let sortMode = "recent";
  let playlistSwipeGesture = null;
  let playlistPressGesture = null;
  let suppressPlaylistClickId = null;
  let coverCropState = null;

  const owner = () => (typeof appCurrentUser !== "undefined" && appCurrentUser && appCurrentUser.id) || "local";
  const esc = (value) => global.eventEsc(String(value ?? ""));
  const js = (value) => global.attrJs(value);
  const pane = () => document.getElementById("pane-musicas");
  // Playlists sincronizadas de outro aparelho apontam para a música pelo clientId da biblioteca
  // quando ela ainda não chegou neste aparelho; aceita os dois identificadores.
  const songById = (id) => musicas.find((song) => String(song.id) === String(id)) || musicas.find((song) => song?.librarySync?.clientId && String(song.librarySync.clientId) === String(id));
  // A collaborator reads the playlist's own snapshot, never a same-id song in
  // their personal library. Virtual ids keep navigation independent of that library.
  const itemSong = item => item?.song ? { ...item.song, id: item.songId } : songById(item?.songId);
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

  function trashIcon() {
    return '<svg viewBox="0 0 24 26" aria-hidden="true"><g class="trash-lid"><path d="M5 6.5h14"/><path d="M9 4.5h6v2H9z"/></g><g class="trash-body"><path d="M7 8v14h10V8"/></g><g class="trash-slats"><path d="M10 10v9"/><path d="M14 10v9"/></g></svg>';
  }

  function playlistSongs(playlist) {
    return (playlist?.items || []).map(itemSong).filter(Boolean);
  }

  function artwork(_name, coverImage = null, songs = []) {
    if (coverImage) return `<span class="home-playlist-art has-image" aria-hidden="true"><img src="${esc(coverImage)}" alt="" loading="lazy" decoding="async" onerror="songArtwork.handleImageError(this)"></span>`;
    const urls = global.songArtwork?.collectDistinct(songs, 4) || [];
    if (!urls.length) return `<span class="home-playlist-art has-image" aria-hidden="true"><img src="${esc(global.songArtwork?.DEFAULT_ARTWORK || "assets/icons/roudy-icon-v4-192.png")}" alt="" loading="lazy" decoding="async"></span>`;
    return `<span class="home-playlist-art has-mosaic home-playlist-mosaic--${urls.length}" aria-hidden="true">${urls.map((url) => `<img src="${esc(url)}" alt="" loading="lazy" decoding="async" onerror="songArtwork.handleImageError(this)">`).join("")}</span>`;
  }

  function applyPlaylistBackdrop(target, coverImage, songs) {
    const urls = coverImage ? [coverImage] : (global.songArtwork?.collectDistinct(songs, 4) || []);
    target.classList.toggle("has-cover", Boolean(urls.length));
    ["--playlist-cover-image", "--playlist-cover-size", "--playlist-cover-position"].forEach((property) => target.style.removeProperty(property));
    if (!urls.length) return;
    const cssUrls = urls.map((url) => `url("${String(url).replace(/"/g, "%22")}")`).join(",");
    target.style.setProperty("--playlist-cover-image", cssUrls);
    if (urls.length === 2) {
      target.style.setProperty("--playlist-cover-size", "50% 100%");
      target.style.setProperty("--playlist-cover-position", "left top,right top");
    } else if (urls.length === 3) {
      target.style.setProperty("--playlist-cover-size", "50% 100%,50% 50%,50% 50%");
      target.style.setProperty("--playlist-cover-position", "left top,right top,right bottom");
    } else if (urls.length >= 4) {
      target.style.setProperty("--playlist-cover-size", "50% 50%");
      target.style.setProperty("--playlist-cover-position", "left top,right top,left bottom,right bottom");
    }
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
    if (!options.keepScroll) {
      global.scrollTo({ top: 0, behavior: "auto" });
      if (next === "playlist") requestAnimationFrame(() => global.scrollTo({ top: 0, behavior: "auto" }));
    }
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
    const order = sortMode === "name"
      ? (a, b) => String(a.name || "").localeCompare(String(b.name || ""), "pt-BR")
      : sortMode === "added"
        ? (a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""))
        : sortMode === "creator"
          ? (a, b) => String(a.sharedFrom ? "recebida" : "você").localeCompare(String(b.sharedFrom ? "recebida" : "você"), "pt-BR") || String(a.name || "").localeCompare(String(b.name || ""), "pt-BR")
          : (a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""));
    const playlists = global.userPlaylists.list(owner()).sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || order(a, b));
    const rows = playlists.map((playlist) => {
      const available = playlist.items.filter(itemSong).length;
      return `<button type="button" class="home-playlist-row" data-playlist-id="${esc(playlist.id)}">${artwork(playlist.name, playlist.coverImage, playlistSongs(playlist))}<span class="home-playlist-copy"><strong>${esc(playlist.name)}</strong><small>${playlist.pinned ? `<span class="home-playlist-pinned-mark" aria-label="Fixada">${pinIcon(true)}</span> ` : ""}Playlist · ${esc(countLabel(available))}${playlist.sharedFrom ? " · recebida" : ""}</small></span></button>`;
    }).join("");
    const empty = playlists.length ? "" : `<p class="home-playlists-hint">Monte playlists do seu jeito: por estilo (rock, blues, samba…), por ministro ou por evento. Cada música guarda o tom daquela playlist.</p>`;
    const sortLabel = { recent: "Recentes", added: "Adicionado recentemente", name: "Alfabeticamente", creator: "Por criador" }[sortMode];
    target.innerHTML = `<button type="button" class="home-playlists-sort" onclick="homePlaylists.openSortSheet()" aria-label="Classificar playlists; ordem atual: ${esc(sortLabel)}"><img src="assets/icons/icone-ajuste-vertical.svg" alt="" aria-hidden="true"><span>${esc(sortLabel)}</span></button>${rows}${empty}`;
    installPlaylistLongPress(target);
  }

  function installPlaylistLongPress(target) {
    target.querySelectorAll(".home-playlist-row").forEach((row) => {
      const id = row.dataset.playlistId;
      row.addEventListener("pointerdown", (event) => {
        if (event.pointerType === "mouse" && event.button !== 0) return;
        const origin = { x: event.clientX, y: event.clientY };
        clearTimeout(playlistPressGesture?.timer);
        playlistPressGesture = { id, origin, timer: setTimeout(() => {
          suppressPlaylistClickId = id;
          setTimeout(() => { if (suppressPlaylistClickId === id) suppressPlaylistClickId = null; }, 800);
          navigator.vibrate?.(10);
          openPlaylistContext(id);
        }, 470) };
      });
      row.addEventListener("pointermove", (event) => {
        if (!playlistPressGesture || playlistPressGesture.id !== id) return;
        if (Math.hypot(event.clientX - playlistPressGesture.origin.x, event.clientY - playlistPressGesture.origin.y) > 9) clearTimeout(playlistPressGesture.timer);
      });
      ["pointerup", "pointercancel", "pointerleave"].forEach((name) => row.addEventListener(name, () => clearTimeout(playlistPressGesture?.timer)));
      row.addEventListener("contextmenu", (event) => { event.preventDefault(); suppressPlaylistClickId = id; setTimeout(() => { if (suppressPlaylistClickId === id) suppressPlaylistClickId = null; }, 800); openPlaylistContext(id); });
      row.addEventListener("click", (event) => {
        if (suppressPlaylistClickId === id) { event.preventDefault(); suppressPlaylistClickId = null; return; }
        open(id);
      });
    });
  }

  function pinIcon(pinned) {
    return `<svg class="home-playlist-pin-icon${pinned ? " is-pinned" : ""}" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 17v5M5 3h14l-2 6v4l2 2H5l2-2V9L5 3Z"/></svg>`;
  }

  function openPlaylistContext(id) {
    const playlist = global.userPlaylists.get(owner(), id);
    if (!playlist) return;
    actionSheet(`<div class="home-playlist-context-preview">${artwork(playlist.name, playlist.coverImage, playlistSongs(playlist))}<span><strong>${esc(playlist.name)}</strong><small>Sua playlist</small></span></div><div class="home-playlist-context-actions"><button type="button" onclick="homePlaylists.togglePinned(${js(id)})">${pinIcon(playlist.pinned)}<span>${playlist.pinned ? "Deixar de fixar playlist" : "Fixar playlist"}</span></button><button type="button" class="is-danger" onclick="homePlaylists.deleteFromHome(${js(id)})"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 4h6l1 3H8l1-3Zm-2 3 1 14h8l1-14M10 11v6M14 11v6"/></svg><span>Apagar playlist</span></button></div>`, `Opções de ${playlist.name}`);
  }

  function togglePinned(id) {
    const playlist = global.userPlaylists.get(owner(), id);
    if (!playlist) return;
    global.userPlaylists.setPinned(owner(), id, !playlist.pinned);
    closeActionSheet();
    renderHome();
    toast(playlist.pinned ? "Playlist desafixada." : "Playlist fixada.");
  }

  function deleteFromHome(id) {
    const playlist = global.userPlaylists.get(owner(), id);
    if (!playlist || !global.appConfirm(`Apagar a playlist “${playlist.name}”?${playlist.collaboration ? ' Ela será excluída para todos os integrantes.' : ''}`)) return;
    global.userPlaylists.remove(owner(), id);
    closeActionSheet();
    renderHome();
    toast("Playlist apagada.");
  }

  function closeActionSheet() {
    clearCoverCrop();
    const layer = document.getElementById("home-playlist-action-layer");
    if (!layer) return;
    layer.classList.remove("is-open");
    setTimeout(() => layer.remove(), 200);
  }

  function actionSheet(content, label) {
    closeActionSheet();
    const layer = document.createElement("div");
    layer.id = "home-playlist-action-layer";
    layer.className = "home-playlist-action-layer";
    layer.setAttribute("role", "presentation");
    layer.innerHTML = `<button type="button" class="home-playlist-action-scrim" onclick="homePlaylists.closeActionSheet()" aria-label="Fechar"></button><section class="home-playlist-action-sheet" role="dialog" aria-modal="true" aria-label="${esc(label)}"><i class="home-playlist-action-handle" aria-hidden="true"></i>${content}</section>`;
    document.body.appendChild(layer);
    requestAnimationFrame(() => layer.classList.add("is-open"));
  }

  function openSortSheet() {
    const options = [["recent", "Recentes"], ["added", "Adicionado recentemente"], ["name", "Alfabeticamente"], ["creator", "Por criador"]];
    actionSheet(`<h2>Classificar por</h2><div class="home-playlist-sort-options">${options.map(([value, label]) => `<button type="button" class="${sortMode === value ? "is-selected" : ""}" onclick="homePlaylists.selectSort('${value}')"><span>${label}</span>${sortMode === value ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4 10-10"/></svg>' : ""}</button>`).join("")}</div><button type="button" class="home-playlist-sheet-cancel" onclick="homePlaylists.closeActionSheet()">Cancelar</button>`, "Classificar playlists");
  }

  function selectSort(value) {
    if (!["recent", "added", "name", "creator"].includes(value)) return;
    sortMode = value;
    closeActionSheet();
    renderHome();
  }

  // ── Playlist aberta ─────────────────────────────────────────────────
  function renderPlaylist() {
    const target = document.getElementById("home-playlist-view");
    const playlist = currentPlaylistId && global.userPlaylists.get(owner(), currentPlaylistId);
    if (!target) return;
    if (!playlist) { setView("home"); return; }
    const entries = playlist.items.map((item) => ({ item, song: itemSong(item) }));
    const available = entries.filter((entry) => entry.song);
    const rows = entries.map(({ item, song }, index) => {
      if (!song) return `<div class="home-playlist-song-swipe" data-item-id="${esc(item.id)}"><button type="button" class="home-playlist-song-delete" onclick="homePlaylists.removeItem(${js(item.id)})" aria-label="Tirar música indisponível da playlist">${trashIcon()}</button><div class="home-playlist-song is-missing"><span class="home-playlist-song-copy"><strong>Música indisponível</strong><small>Ela não está mais na sua biblioteca</small></span><button type="button" class="home-playlist-song-more" onclick="homePlaylists.itemMenu(${js(item.id)})" aria-label="Opções">⋯</button></div></div>`;
      const key = itemKey(song, item);
      const capo = Number(itemPlayback(song, item).capo) || 0;
      return `<div class="home-playlist-song-swipe" data-item-id="${esc(item.id)}"><button type="button" class="home-playlist-song-delete" onclick="homePlaylists.removeItem(${js(item.id)})" aria-label="Tirar ${esc(song.title)} da playlist">${trashIcon()}</button><div class="home-playlist-song"><button type="button" class="home-playlist-song-open" onclick="homePlaylists.openSong(${js(item.id)})"><span class="home-playlist-song-copy"><strong>${esc(song.title)}</strong><small>${esc(song.artist || "Artista não informado")}${capo ? ` · Capo ${capo}` : ""}${item.notes ? ` · ${esc(item.notes)}` : ""}</small></span></button><button type="button" class="home-playlist-song-more" onclick="homePlaylists.itemMenu(${js(item.id)})" aria-label="Opções de ${esc(song.title)}"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg></button></div></div>`;
    }).join("");
    const memberName = String((typeof appCurrentUser !== "undefined" && appCurrentUser?.name) || "Você");
    const memberAvatar = typeof appCurrentUser !== "undefined" && appCurrentUser?.avatarUrl;
    const memberInitial = memberName.trim().charAt(0).toUpperCase() || "V";
    applyPlaylistBackdrop(target, playlist.coverImage, available.map((entry) => entry.song));
    target.innerHTML = `<div class="home-playlist-detail-hero"><button type="button" class="home-playlist-back" onclick="homePlaylists.back()" aria-label="Voltar para as playlists"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg></button><div class="home-playlist-cover">${artwork(playlist.name, playlist.coverImage, available.map((entry) => entry.song))}<button type="button" class="home-playlist-cover-edit" onclick="homePlaylists.chooseCover()" aria-label="Adicionar ou alterar foto da playlist"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20l4.2-1 10.6-10.6a2.4 2.4 0 0 0-3.4-3.4L4.8 15.6 4 20Z"/></svg></button></div><div class="home-playlist-heading"><h2>${esc(playlist.name)}</h2><div class="home-playlist-member"><button type="button" class="home-playlist-member-add" onclick="homePlaylists.share()" aria-label="Adicionar pessoa à playlist">＋</button><span class="home-playlist-member-avatar${memberAvatar ? " has-image" : ""}">${memberAvatar ? `<img src="${esc(memberAvatar)}" alt="">` : esc(memberInitial)}</span><strong>${esc(memberName)}</strong></div><small>Playlist · ${esc(countLabel(available.length))}${playlist.sharedFrom ? " · recebida" : ""}</small></div></div>
      <div class="home-playlist-actions"><button type="button" class="home-playlist-action-round" onclick="homePlaylists.renameCurrent()" aria-label="Editar nome da playlist"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20l4.2-1 10.6-10.6a2.4 2.4 0 0 0-3.4-3.4L4.8 15.6 4 20Z"/></svg></button><button type="button" class="home-playlist-action-round" onclick="homePlaylists.share()" aria-label="Compartilhar playlist"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11m0-11 4 4m-4-4L8 8M5 12v7h14v-7"/></svg></button><button type="button" class="home-playlist-play" onclick="homePlaylists.play()" ${available.length ? "" : "disabled"} aria-label="Abrir primeira música no Estudo"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10-6.5z"/></svg></button><button type="button" class="home-playlist-action-round home-playlist-tone-action" onclick="homePlaylists.openKeys()" ${available.length ? "" : "disabled"} aria-label="Ajustar tons das músicas"><span aria-hidden="true">Tom</span></button><button type="button" class="home-playlist-action-round" onclick="homePlaylists.useInEvent()" aria-label="Adicionar playlist a um evento"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16M12 13v5M9.5 15.5h5"/></svg></button></div>
      <button type="button" class="home-playlist-add-row" onclick="homePlaylists.openAddSongs()"><span aria-hidden="true">＋</span><strong>Adicionar uma música</strong></button><div class="home-playlist-songs">${rows || `<div class="home-playlist-empty"><strong>Playlist vazia</strong><span>Adicione músicas da sua biblioteca. Cada uma fica com o tom desta playlist.</span><button type="button" onclick="homePlaylists.openAddSongs()">Adicionar músicas</button></div>`}</div>`;
    const members = target.querySelector('.home-playlist-member');
    members.querySelector('.home-playlist-member-add').setAttribute('onclick', 'playlistInvites.open(homePlaylists.currentPlaylistId)');
    if (playlist.collaboration?.members?.length) {
      const addButton = members.querySelector('.home-playlist-member-add').outerHTML;
      members.innerHTML = addButton + playlist.collaboration.members.map(member => `<span class="home-playlist-member-avatar${member.avatarUrl ? ' has-image' : ''}" role="img" aria-label="${esc(member.name)}, colaborador" title="${esc(member.name)}">${member.avatarUrl ? `<img src="${esc(member.avatarUrl)}" alt="" referrerpolicy="no-referrer">` : esc(String(member.name || '?').charAt(0))}</span>`).join('') + `<strong>${esc(playlist.collaboration.members.map(member => member.name).join(', '))}</strong>`;
    }
    if (playlist.collaboration?.blocked) {
      const notice = document.createElement('button'); notice.type = 'button'; notice.className = 'btn btn-outline';
      notice.textContent = 'Revisar ajustes não enviados'; notice.onclick = () => global.playlistInvites.open(playlist.id);
      target.querySelector('.home-playlist-heading').appendChild(notice);
    }
    installPlaylistSwipe(target);
  }

  function installPlaylistSwipe(target) {
    if (target.dataset.swipeInstalled === "true") return;
    target.dataset.swipeInstalled = "true";
    target.addEventListener("pointerdown", (event) => {
      const song = event.target.closest(".home-playlist-song");
      if (!song || !["touch", "pen"].includes(event.pointerType)) return;
      const row = song.closest(".home-playlist-song-swipe");
      playlistSwipeGesture = { pointerId: event.pointerId, row, song, startX: event.clientX, startY: event.clientY, horizontal: false, armed: false };
      song.setPointerCapture?.(event.pointerId);
    });
    target.addEventListener("pointermove", (event) => {
      const gesture = playlistSwipeGesture;
      if (!gesture || event.pointerId !== gesture.pointerId) return;
      const dx = event.clientX - gesture.startX;
      const dy = event.clientY - gesture.startY;
      if (!gesture.horizontal && Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      if (!gesture.horizontal) {
        if (Math.abs(dy) >= Math.abs(dx)) { playlistSwipeGesture = null; return; }
        gesture.horizontal = true;
        gesture.song.style.transition = "none";
      }
      const width = Math.max(1, gesture.row.getBoundingClientRect().width);
      const offset = Math.max(-width, Math.min(0, dx));
      const progress = Math.abs(offset) / width;
      gesture.armed = progress >= .52;
      gesture.song.style.transform = `translate3d(${offset}px,0,0)`;
      const reveal=Math.min(1,progress/.52);
      gesture.row.style.setProperty("--playlist-swipe-progress",String(reveal));
      gesture.row.style.setProperty("--playlist-trash-right",`${5+reveal*19}px`);
      gesture.row.style.setProperty("--playlist-trash-opacity",String(.26+reveal*.74));
      gesture.row.style.setProperty("--playlist-trash-scale",String(.68+reveal*.32));
      gesture.row.style.setProperty("--playlist-trash-bars",`${2-reveal*4}px`);
      gesture.row.classList.toggle("is-armed", gesture.armed);
      event.preventDefault();
    });
    const finish = (event) => {
      const gesture = playlistSwipeGesture;
      if (!gesture || event.pointerId !== gesture.pointerId) return;
      playlistSwipeGesture = null;
      gesture.song.style.removeProperty("transition");
      if (!gesture.horizontal) return;
      if (gesture.armed && event.type !== "pointercancel") {
        gesture.row.classList.add("is-removing");
        navigator.vibrate?.(10);
        global.userPlaylists.removeItem(owner(), currentPlaylistId, gesture.row.dataset.itemId);
        setTimeout(renderPlaylist, 260);
        return;
      }
      gesture.song.style.removeProperty("transform");
      ["--playlist-swipe-progress","--playlist-trash-right","--playlist-trash-opacity","--playlist-trash-scale","--playlist-trash-bars"].forEach(name=>gesture.row.style.removeProperty(name));
      gesture.row.classList.remove("is-armed");
    };
    target.addEventListener("pointerup", finish);
    target.addEventListener("pointercancel", finish);
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
    return playlist.items.map((item) => ({ item, song: itemSong(item) })).filter((entry) => entry.song);
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
      userPlaylistItem: { playlistId: playlist.id, itemId: item.id, ownerId: owner() }
    });
    if (options.stage && global.enterStageMode) global.enterStageMode();
  }

  function play() {
    const playlist = global.userPlaylists.get(owner(), currentPlaylistId);
    const first = playlist && availableEntries(playlist)[0];
    if (first) openSong(first.item.id);
  }

  function chooseCover() {
    actionSheet(`<div class="home-playlist-cover-options"><button type="button" onclick="homePlaylists.pickCover('library')"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m5 18 5-5 3 3 2-2 4 4"/></svg><span>Escolher da biblioteca</span></button><button type="button" onclick="homePlaylists.pickCover('camera')"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4Z"/><circle cx="12" cy="13" r="4"/></svg><span>Tirar foto</span></button><button type="button" onclick="homePlaylists.coverAiUnavailable()"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="m5 17 5-5 3 3 2-2 4 4M18 2v4M16 4h4"/></svg><span>Criar com IA</span><small>Em breve</small></button></div>`, "Alterar foto da playlist");
  }

  function pickCover(source) {
    closeActionSheet();
    let input = document.getElementById("home-playlist-cover-input");
    if (!input) {
      input = document.createElement("input");
      input.id = "home-playlist-cover-input";
      input.type = "file";
      input.accept = "image/*";
      input.className = "home-playlist-cover-input";
      input.addEventListener("change", () => {
        const file = input.files && input.files[0];
        input.value = "";
        if (file) setCoverFromFile(file);
      });
      document.body.appendChild(input);
    }
    if (source === "camera") input.setAttribute("capture", "environment");
    else input.removeAttribute("capture");
    input.click();
  }

  function coverAiUnavailable() {
    closeActionSheet();
    toast("Criação de capas com IA estará disponível em breve.");
  }

  async function setCoverFromFile(file) {
    if (!file || !file.type.startsWith("image/")) { toast("Escolha uma imagem para a playlist."); return; }
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => openCoverCrop(image, url);
    image.onerror = () => { URL.revokeObjectURL(url); toast("Não foi possível usar esta foto."); };
    image.src = url;
  }

  function openCoverCrop(image, url) {
    actionSheet(`<div class="home-playlist-cover-crop"><h2>Ajustar foto</h2><div class="home-playlist-cover-crop-frame" id="home-playlist-cover-crop-frame" role="application" tabindex="0" aria-label="Enquadramento da foto. Arraste para ajustar."><img id="home-playlist-cover-crop-image" src="${esc(url)}" alt="" draggable="false"></div><p>Arraste a foto para ajustar o enquadramento.</p><div class="home-playlist-cover-crop-actions"><button type="button" onclick="homePlaylists.closeActionSheet()">Cancelar</button><button type="button" class="is-primary" onclick="homePlaylists.saveCoverCrop()">Usar foto</button></div></div>`, "Ajustar foto da playlist");
    coverCropState = { image, url, playlistId: currentPlaylistId, x: 0, y: 0, pointerId: null, startX: 0, startY: 0, originX: 0, originY: 0, resizeObserver: null };
    requestAnimationFrame(installCoverCrop);
  }

  function clearCoverCrop() {
    if (!coverCropState) return;
    coverCropState.resizeObserver?.disconnect();
    URL.revokeObjectURL(coverCropState.url);
    coverCropState = null;
  }

  function coverCropMetrics() {
    const state = coverCropState;
    const frame = document.getElementById("home-playlist-cover-crop-frame");
    const target = document.getElementById("home-playlist-cover-crop-image");
    if (!state || !frame || !target) return null;
    const size = frame.clientWidth;
    const scale = Math.max(size / state.image.naturalWidth, size / state.image.naturalHeight);
    const width = state.image.naturalWidth * scale;
    const height = state.image.naturalHeight * scale;
    const limitX = Math.max(0, (width - size) / 2);
    const limitY = Math.max(0, (height - size) / 2);
    state.x = Math.max(-limitX, Math.min(limitX, state.x));
    state.y = Math.max(-limitY, Math.min(limitY, state.y));
    const left = (size - width) / 2 + state.x;
    const top = (size - height) / 2 + state.y;
    Object.assign(target.style, { width: `${width}px`, height: `${height}px`, left: `${left}px`, top: `${top}px` });
    return { state, frame, target, size, scale, left, top };
  }

  function installCoverCrop() {
    const metrics = coverCropMetrics();
    if (!metrics) return;
    const { state, frame } = metrics;
    frame.addEventListener("pointerdown", (event) => {
      if (state.pointerId !== null) return;
      state.pointerId = event.pointerId;
      state.startX = event.clientX;
      state.startY = event.clientY;
      state.originX = state.x;
      state.originY = state.y;
      frame.classList.add("is-dragging");
      frame.setPointerCapture?.(event.pointerId);
    });
    frame.addEventListener("pointermove", (event) => {
      if (state.pointerId !== event.pointerId) return;
      event.preventDefault();
      state.x = state.originX + event.clientX - state.startX;
      state.y = state.originY + event.clientY - state.startY;
      coverCropMetrics();
    });
    const finish = (event) => {
      if (state.pointerId !== event.pointerId) return;
      if (frame.hasPointerCapture?.(event.pointerId)) frame.releasePointerCapture(event.pointerId);
      state.pointerId = null;
      frame.classList.remove("is-dragging");
    };
    frame.addEventListener("pointerup", finish);
    frame.addEventListener("pointercancel", finish);
    frame.addEventListener("keydown", (event) => {
      const movement = { ArrowLeft: [8, 0], ArrowRight: [-8, 0], ArrowUp: [0, 8], ArrowDown: [0, -8] }[event.key];
      if (!movement) return;
      event.preventDefault();
      state.x += movement[0];
      state.y += movement[1];
      coverCropMetrics();
    });
    if (global.ResizeObserver) {
      state.resizeObserver = new ResizeObserver(() => coverCropMetrics());
      state.resizeObserver.observe(frame);
    }
    frame.focus({ preventScroll: true });
  }

  function saveCoverCrop() {
    const metrics = coverCropMetrics();
    if (!metrics) return;
    const { state, size, scale, left, top } = metrics;
    try {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 720;
      const sourceX = Math.max(0, -left / scale);
      const sourceY = Math.max(0, -top / scale);
      const sourceSide = size / scale;
      canvas.getContext("2d").drawImage(state.image, sourceX, sourceY, sourceSide, sourceSide, 0, 0, 720, 720);
      const value = canvas.toDataURL("image/jpeg", .82);
      if (!global.userPlaylists.setCoverImage(owner(), state.playlistId, value)) throw new Error("save");
      closeActionSheet();
      renderPlaylist();
      global.scrollTo({ top: 0, behavior: "auto" });
      requestAnimationFrame(() => global.scrollTo({ top: 0, behavior: "auto" }));
      toast("Foto da playlist atualizada.");
    } catch (_error) {
      toast("Não foi possível usar esta foto.");
    }
  }

  // Usado pela navegação (anterior/próxima) da tela da música.
  function variantForContext(context) {
    if (!context || !String(context.playlistId || "").startsWith(PREFIX)) return null;
    const playlist = global.userPlaylists.get(owner(), String(context.playlistId).slice(PREFIX.length));
    const entry = playlist && availableEntries(playlist)[context.currentIndex];
    return entry ? { song: itemVariant(entry.song, entry.item), item: { playlistId: playlist.id, itemId: entry.item.id, ownerId: owner() } } : null;
  }

  function shiftKey(itemId, direction) {
    const playlist = global.userPlaylists.get(owner(), currentPlaylistId);
    const item = playlist && playlist.items.find((value) => value.id === String(itemId));
    const song = item && itemSong(item);
    if (!song) return;
    const semitones = (Number(itemPlayback(song, item).semitones) || 0) + (direction < 0 ? -1 : 1);
    const normalized = ((semitones % 12) + 18) % 12 - 6;
    global.userPlaylists.setItemPlayback(owner(), playlist.id, item.id, { semitones: normalized });
    if (document.getElementById("home-playlist-keys")) renderKeysSheet();
    else renderPlaylist();
  }

  function openKeys() {
    eventAdminSheetState = { type: "field" };
    global.showEventAdminSheet(`${global.eventAdminHeader("Tom das músicas")}<div class="home-playlist-keys" id="home-playlist-keys"></div>`, "Ajustar tons das músicas");
    renderKeysSheet();
  }

  function renderKeysSheet() {
    const target = document.getElementById("home-playlist-keys");
    const playlist = global.userPlaylists.get(owner(), currentPlaylistId);
    if (!target || !playlist) return;
    target.innerHTML = availableEntries(playlist).map(({ item, song }) => `<div class="home-playlist-key-row"><span><strong>${esc(song.title)}</strong><small>${esc(song.artist || "Artista não informado")}</small></span><div class="home-playlist-key-stepper" aria-label="Tom de ${esc(song.title)}"><button type="button" onclick="homePlaylists.shiftKey(${js(item.id)},-1)" aria-label="Baixar tom de ${esc(song.title)}">−</button><output aria-live="polite">${esc(itemKey(song, item) || "—")}</output><button type="button" onclick="homePlaylists.shiftKey(${js(item.id)},1)" aria-label="Aumentar tom de ${esc(song.title)}">+</button></div></div>`).join("") || '<p class="home-playlist-key-empty">Adicione músicas para ajustar os tons.</p>';
  }

  // Salva tom/capo/BPM… alterados na tela da música, só nesta playlist.
  function saveItemPlayback(context, state) {
    if (!context || (context.ownerId && context.ownerId !== owner())) return false;
    const playback = {};
    for (const field of global.userPlaylists.PLAYBACK_FIELDS) if (state[field] !== undefined) playback[field] = state[field];
    if (isCollaborativeContext(context)) {
      const item = global.userPlaylists.get(owner(), context.playlistId)?.items.find(item => item.id === context.itemId);
      return Boolean(item && global.userPlaylists.setItemContent(owner(), context.playlistId, context.itemId, { ...item.song, ...state.video }, playback));
    }
    return Boolean(global.userPlaylists.setItemPlayback(owner(), context.playlistId, context.itemId, playback));
  }

  function isCollaborativeContext(context) { return Boolean(context && (!context.ownerId || context.ownerId === owner()) && global.userPlaylists.get(owner(), context.playlistId)?.collaboration); }
  function saveItemSong(context, song) {
    return isCollaborativeContext(context) && Boolean(global.userPlaylists.setItemContent(owner(), context.playlistId, context.itemId, song));
  }

  // ── Criar, renomear, apagar ─────────────────────────────────────────
  function nameSheet(title, value, action) {
    eventAdminSheetState = { type: "field" };
    global.showEventAdminSheet(`${global.eventAdminHeader(title, action)}<label class="home-playlist-name-field"><span>Nome da playlist</span><input id="home-playlist-name" class="form-input" maxlength="120" value="${esc(value)}" placeholder="Ex.: Rock, Blues, Ministro João" onkeydown="if(event.key==='Enter'){event.preventDefault();${action}}"></label>`, title);
    setTimeout(() => document.getElementById("home-playlist-name")?.select(), 80);
  }

  function closeCreate() {
    const overlay = document.getElementById("home-playlist-create");
    if (!overlay) return;
    overlay.classList.remove("is-open");
    setTimeout(() => overlay.remove(), 180);
  }

  function openCreate() {
    closeCreate();
    const overlay = document.createElement("section");
    overlay.id = "home-playlist-create";
    overlay.className = "home-playlist-create";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "home-playlist-create-title");
    overlay.innerHTML = `<button type="button" class="home-playlist-create-close" onclick="homePlaylists.closeCreate()" aria-label="Fechar"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button><div class="home-playlist-create-content"><h2 id="home-playlist-create-title">Dê um nome à sua playlist</h2><label><span class="sr-only">Nome da playlist</span><input id="home-playlist-name" maxlength="120" autocomplete="off" placeholder="Ex.: Rock, Blues, Ministro João" onkeydown="if(event.key==='Enter'){event.preventDefault();homePlaylists.confirmCreate()}"></label><button type="button" class="home-playlist-create-submit" onclick="homePlaylists.confirmCreate()">Criar</button></div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add("is-open"));
    setTimeout(() => document.getElementById("home-playlist-name")?.focus(), 100);
  }

  function create(songIds = []) {
    pendingSongIds = (Array.isArray(songIds) ? songIds : [songIds]).filter((songId) => songId != null && songId !== "");
    global.closeEventAdminSheet?.();
    openCreate();
  }

  let pendingSongIds = [];
  function confirmCreate() {
    const name = document.getElementById("home-playlist-name")?.value.trim();
    if (!name) { toast("Dê um nome para a playlist."); return; }
    const items = pendingSongIds.map((songId) => ({ songId, playback: global.userPlaylists.cleanPlayback(songById(songId)?.playbackSettings) }));
    const playlist = global.userPlaylists.create(owner(), name, items);
    pendingSongIds = [];
    closeCreate();
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
    global.showEventAdminSheet(`${global.eventAdminHeader(title)}<div class="home-playlist-menu">${actions.map(([label, action, danger, icon]) => `<button type="button" class="${danger ? "is-danger " : ""}${icon ? "has-icon" : ""}" onclick="${action}">${icon || ""}<span>${esc(label)}</span></button>`).join("")}</div>`, title);
  }

  function itemMenuIcon(type) {
    const paths = {
      repertoire: '<path d="M4 6h10M4 11h10M4 16h7M18 13v8M14 17h8"/>',
      share: '<path d="M12 4v11m0-11 4 4m-4-4L8 8M5 12v7h14v-7"/>',
      remove: '<path d="M4 7h16M9 7V4h6v3m-9 0 1 14h10l1-14M10 11v6m4-6v6"/>',
      note: '<path d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h5"/>'
    };
    return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[type] || ""}</svg>`;
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
    if (!playlist || !global.appConfirm(`Apagar a playlist “${playlist.name}”? ${playlist.collaboration ? 'Ela será excluída para todos os integrantes. ' : ''}As músicas continuam na sua biblioteca.`)) return;
    global.userPlaylists.remove(owner(), playlist.id);
    toast("Playlist apagada.");
    back();
  }

  function itemMenu(itemId) {
    const playlist = global.userPlaylists.get(owner(), currentPlaylistId);
    const item = playlist && playlist.items.find((value) => value.id === String(itemId));
    if (!item) return;
    const song = itemSong(item);
    menuSheet(song ? song.title : "Música", [
      ["Adicionar ao repertório", `homePlaylists.addItemToRepertoire(${js(item.id)})`, false, itemMenuIcon("repertoire")],
      ["Compartilhar", `homePlaylists.shareItem(${js(item.id)})`, false, itemMenuIcon("share")],
      ["Remover da playlist", `homePlaylists.removeItem(${js(item.id)})`, true, itemMenuIcon("remove")],
      ["Observação", `homePlaylists.editNotes(${js(item.id)})`, false, itemMenuIcon("note")]
    ]);
  }

  function playlistItem(itemId) {
    const playlist = global.userPlaylists.get(owner(), currentPlaylistId);
    return playlist && playlist.items.find((value) => value.id === String(itemId));
  }

  function addItemToRepertoire(itemId) {
    const item = playlistItem(itemId);
    const song = item && itemSong(item);
    if (!song) return;
    const trigger = document.activeElement;
    global.closeEventAdminSheet();
    global.showAddSongEventSheet(itemVariant(song, item), trigger, "repertoire");
  }

  async function shareItem(itemId) {
    const item = playlistItem(itemId);
    const song = item && itemSong(item);
    if (!song) return;
    const variant = itemVariant(song, item);
    const key = itemKey(song, item);
    const text = [variant.title, variant.artist, key ? `Tom: ${key}` : ""].filter(Boolean).join(" · ");
    global.closeEventAdminSheet();
    if (global.navigator.share) {
      try {
        await global.navigator.share({ title: variant.title, text });
        return;
      } catch (error) {
        if (error && error.name === "AbortError") return;
      }
    }
    try {
      await global.navigator.clipboard.writeText(text);
      toast("Música copiada para compartilhar.");
    } catch (_error) {
      global.appPrompt("Copie e compartilhe:", text);
    }
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
      .filter((song) => !present.has(String(song.id)))
      .filter((song) => !addQuery || `${song.title || ""} ${song.artist || ""}`.toLocaleLowerCase("pt-BR").includes(addQuery))
      .sort((a, b) => String(a.title || "").localeCompare(String(b.title || ""), "pt-BR"))
      .slice(0, 120);
    target.innerHTML = songs.map((song) => {
      return `<div class="event-admin-song-row">${global.eventSongArtwork(song)}<span class="event-admin-song-copy"><strong>${esc(song.title)}</strong>${song.artist ? `<small>${esc(song.artist)}</small>` : ""}</span><button type="button" class="event-admin-add-button" onclick="homePlaylists.addSong(${js(song.id)},this)" aria-label="Adicionar ${esc(song.title)}"><svg class="plus" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M12 7v10M7 12h10"></path></svg><svg class="check" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><path d="m7.5 12 3 3 6-7"></path></svg></button></div>`;
    }).join("") || `<div class="event-admin-empty">${addQuery ? "Nenhuma música encontrada." : musicas.length ? "Todas as músicas já estão nesta playlist." : "Sua biblioteca está vazia."}</div>`;
  }

  function addSong(songId, button) {
    const song = songById(songId);
    if (!song) return;
    global.userPlaylists.addSong(owner(), currentPlaylistId, song.id, global.userPlaylists.cleanPlayback(song.playbackSettings));
    if (button) { button.disabled = true; button.classList.add("is-added"); }
    renderPlaylist();
    setTimeout(renderAddList, 180);
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
    // Share always exports a fixed copy; collaboration invitations belong to +.
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
    PREFIX, setView, libraryVisible, markLibraryDirty, libraryRendered, renderHome, openSortSheet, selectSort, closeActionSheet, open, openLibrary, back, openSong, play, chooseCover, pickCover, coverAiUnavailable, saveCoverCrop, variantForContext, openKeys, shiftKey, saveItemPlayback,
    create, closeCreate, confirmCreate, renameCurrent, confirmRename, playlistMenu, duplicateCurrent, deleteCurrent, openPlaylistContext, togglePinned, deleteFromHome, itemMenu, addItemToRepertoire, shareItem, moveItem, removeItem, editNotes, saveNotes,
    openAddSongs, filterAdd, addSong, chooseForSong, addSongTo, useInEvent, addPlaylistToEvent, eventItemsFromPlaylist, share, openReceived, saveReceived, checkSharedLink,
    refreshCollaboration() { if (view === 'playlist') renderPlaylist(); else if (view === 'home') renderHome(); },
    isCollaborativeContext, saveItemSong,
    get ownerId() { return owner(); }, get view() { return view; }, get currentPlaylistId() { return currentPlaylistId; }
  });
})(window);
