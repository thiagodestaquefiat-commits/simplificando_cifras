const STORAGE_KEYS = {
  songs: "sc_musicas_v2",
  playlists: "sc_playlists_v2",
  favorites: "sc_favorites_v2"
};

const state = {
  tab: "songs",
  query: "",
  songs: [],
  playlists: [],
  favorites: new Set(),
  currentSongId: null,
  semitones: 0,
  installPrompt: null
};

const $ = (selector) => document.querySelector(selector);

const noteScale = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const flatToSharp = { Db: "C#", Eb: "D#", Gb: "F#", Ab: "G#", Bb: "A#" };

function loadJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function save() {
  localStorage.setItem(STORAGE_KEYS.songs, JSON.stringify(state.songs));
  localStorage.setItem(STORAGE_KEYS.playlists, JSON.stringify(state.playlists));
  localStorage.setItem(STORAGE_KEYS.favorites, JSON.stringify([...state.favorites]));
}

function boot() {
  state.songs = loadJson(STORAGE_KEYS.songs, window.DEFAULT_MUSICAS || []);
  state.playlists = loadJson(STORAGE_KEYS.playlists, []);
  state.favorites = new Set(loadJson(STORAGE_KEYS.favorites, []));
  bindEvents();
  render();
  registerServiceWorker();
}

function bindEvents() {
  $("#searchInput").addEventListener("input", (event) => {
    state.query = event.target.value.trim().toLowerCase();
    renderLists();
  });

  document.querySelectorAll(".segmented button").forEach((button) => {
    button.addEventListener("click", () => {
      state.tab = button.dataset.tab;
      render();
    });
  });

  $("#backBtn").addEventListener("click", closeReader);
  $("#favoriteBtn").addEventListener("click", toggleFavorite);
  $("#transposeDown").addEventListener("click", () => transpose(-1));
  $("#transposeUp").addEventListener("click", () => transpose(1));
  $("#resetKey").addEventListener("click", () => {
    state.semitones = 0;
    renderReader();
  });
  $("#stageBtn").addEventListener("click", () => document.body.classList.toggle("stage"));
  $("#shareBtn").addEventListener("click", shareCurrentSong);
  $("#addToPlaylistBtn").addEventListener("click", openPlaylistDialog);
  $("#newSongBtn").addEventListener("click", openSongDialog);
  $("#cancelSong").addEventListener("click", () => $("#songDialog").close());
  $("#cancelPlaylist").addEventListener("click", () => $("#playlistDialog").close());
  $("#songForm").addEventListener("submit", saveSongFromForm);
  $("#playlistForm").addEventListener("submit", addCurrentToPlaylist);

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    state.installPrompt = event;
    $("#installBtn").hidden = false;
  });

  $("#installBtn").addEventListener("click", async () => {
    if (!state.installPrompt) return;
    state.installPrompt.prompt();
    await state.installPrompt.userChoice;
    state.installPrompt = null;
    $("#installBtn").hidden = true;
  });
}

function render() {
  document.querySelectorAll(".segmented button").forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === state.tab);
  });

  $("#songsPane").hidden = state.tab === "playlists";
  $("#playlistsPane").hidden = state.tab !== "playlists";
  renderStats();
  renderLists();
}

function renderStats() {
  $("#musicCount").textContent = state.songs.length;
  $("#favoriteCount").textContent = state.favorites.size;
  $("#playlistCount").textContent = state.playlists.length;
}

function renderLists() {
  if (state.tab === "playlists") {
    renderPlaylists();
    return;
  }

  const onlyFavorites = state.tab === "favorites";
  const songs = state.songs
    .filter((song) => !onlyFavorites || state.favorites.has(String(song.id)))
    .filter(matchesQuery)
    .sort((a, b) => a.title.localeCompare(b.title, "pt-BR"));

  $("#songsPane").innerHTML = songs.length
    ? songs.map(songRow).join("")
    : `<div class="empty">Nenhuma música encontrada.</div>`;

  document.querySelectorAll("[data-open-song]").forEach((button) => {
    button.addEventListener("click", () => openSong(button.dataset.openSong));
  });
}

function matchesQuery(song) {
  const haystack = [
    song.title,
    song.artist,
    song.key,
    song.capo,
    ...(song.blocos || []).flatMap((block) => [block.l, block.c])
  ].join(" ").toLowerCase();
  return haystack.includes(state.query);
}

function songRow(song) {
  const favorite = state.favorites.has(String(song.id)) ? "★" : "";
  const subtitle = [song.artist, song.capo, `${song.blocos?.length || 0} blocos`].filter(Boolean).join(" · ");
  return `
    <button class="song-row" type="button" data-open-song="${song.id}">
      <span>
        <strong>${escapeHtml(song.title)} ${favorite}</strong>
        <small>${escapeHtml(subtitle)}</small>
      </span>
      <span class="key-pill">${escapeHtml(song.key || "--")}</span>
    </button>
  `;
}

function renderPlaylists() {
  $("#playlistsPane").innerHTML = state.playlists.length
    ? state.playlists.map((playlist) => {
      const count = playlist.songIds.length;
      const names = playlist.songIds
        .map((id) => state.songs.find((song) => String(song.id) === String(id))?.title)
        .filter(Boolean)
        .join(", ");
      return `
        <button class="playlist-row" type="button" data-playlist="${playlist.id}">
          <span>
            <strong>${escapeHtml(playlist.name)}</strong>
            <small>${escapeHtml(names || "Playlist vazia")}</small>
          </span>
          <span class="key-pill">${count}</span>
        </button>
      `;
    }).join("")
    : `<div class="empty">Crie uma playlist a partir de uma música.</div>`;

  document.querySelectorAll("[data-playlist]").forEach((button) => {
    button.addEventListener("click", () => openPlaylist(button.dataset.playlist));
  });
}

function openPlaylist(id) {
  const playlist = state.playlists.find((item) => String(item.id) === String(id));
  if (!playlist) return;
  state.tab = "songs";
  state.query = "";
  $("#searchInput").value = "";
  const firstSongId = playlist.songIds.find((songId) => state.songs.some((song) => String(song.id) === String(songId)));
  if (firstSongId) openSong(firstSongId);
  else toast("Playlist vazia");
}

function openSong(id) {
  state.currentSongId = String(id);
  state.semitones = 0;
  $("#libraryView").hidden = true;
  $("#reader").hidden = false;
  $("#newSongBtn").hidden = true;
  renderReader();
}

function closeReader() {
  document.body.classList.remove("stage");
  $("#reader").hidden = true;
  $("#libraryView").hidden = false;
  $("#newSongBtn").hidden = false;
  state.currentSongId = null;
  render();
}

function getCurrentSong() {
  return state.songs.find((song) => String(song.id) === state.currentSongId);
}

function renderReader() {
  const song = getCurrentSong();
  if (!song) return;
  const key = transposeChord(song.key || "", state.semitones);
  const semitoneLabel = Math.abs(state.semitones) === 1 ? "semitom" : "semitons";
  const meta = [song.artist, song.capo, state.semitones ? `${signed(state.semitones)} ${semitoneLabel}` : "Tom original"].filter(Boolean).join(" · ");

  $("#songTitle").textContent = song.title;
  $("#songMeta").textContent = meta;
  $("#currentKey").textContent = key || "--";
  $("#favoriteBtn").textContent = state.favorites.has(String(song.id)) ? "★" : "♡";
  $("#songContent").innerHTML = (song.blocos || []).map((block) => `
    <section class="block">
      ${block.l ? `<div class="block-label">${escapeHtml(block.l)}</div>` : ""}
      <pre class="chords">${escapeHtml(transposeText(block.c || "", state.semitones))}</pre>
    </section>
  `).join("");
}

function transpose(delta) {
  state.semitones += delta;
  renderReader();
}

function transposeText(text, semitones) {
  if (!semitones) return text;
  return text.replace(/\b([A-G](?:#|b)?)(m|maj|min|dim|sus|add)?([0-9]*)?([()/+#0-9a-zA-Z]*)?/g, (match) => {
    return transposeChord(match, semitones);
  });
}

function transposeChord(chord, semitones) {
  if (!chord) return chord;
  const match = chord.match(/^([A-G](?:#|b)?)(.*)$/);
  if (!match) return chord;
  const root = flatToSharp[match[1]] || match[1];
  const index = noteScale.indexOf(root);
  if (index < 0) return chord;
  return noteScale[(index + semitones + 120) % 12] + match[2];
}

function signed(value) {
  return value > 0 ? `+${value}` : String(value);
}

function toggleFavorite() {
  const song = getCurrentSong();
  if (!song) return;
  const id = String(song.id);
  if (state.favorites.has(id)) state.favorites.delete(id);
  else state.favorites.add(id);
  save();
  renderReader();
  renderStats();
}

function shareCurrentSong() {
  const song = getCurrentSong();
  if (!song) return;
  const text = `${song.title}\nTom: ${transposeChord(song.key || "", state.semitones) || "--"}\n\n${(song.blocos || []).map((block) => `${block.l ? `[${block.l}]\n` : ""}${transposeText(block.c || "", state.semitones)}`).join("\n\n")}`;
  if (navigator.share) {
    navigator.share({ title: song.title, text }).catch(() => {});
  } else {
    navigator.clipboard?.writeText(text);
    toast("Cifra copiada");
  }
}

function openSongDialog() {
  $("#songForm").reset();
  $("#songDialog").showModal();
}

function saveSongFromForm(event) {
  event.preventDefault();
  const title = $("#formTitle").value.trim();
  if (!title) return;
  state.songs.push({
    id: Date.now(),
    title,
    artist: $("#formArtist").value.trim(),
    key: $("#formKey").value.trim(),
    capo: $("#formCapo").value.trim(),
    blocos: parseBlocks($("#formBlocks").value)
  });
  save();
  $("#songDialog").close();
  render();
  toast("Música salva");
}

function parseBlocks(raw) {
  const blocks = [];
  let current = { l: "", c: "" };
  raw.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      if (current.c.trim()) blocks.push(current);
      current = { l: "", c: "" };
      return;
    }
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      if (current.c.trim()) blocks.push(current);
      current = { l: trimmed.slice(1, -1), c: "" };
      return;
    }
    current.c += `${current.c ? "\n" : ""}${line}`;
  });
  if (current.c.trim()) blocks.push(current);
  return blocks.length ? blocks : [{ l: "", c: raw.trim() || "C  G  Am  F" }];
}

function openPlaylistDialog() {
  const options = state.playlists.map((playlist) => `<option value="${playlist.id}">${escapeHtml(playlist.name)}</option>`).join("");
  $("#playlistSelect").innerHTML = `<option value="">Escolher playlist</option>${options}`;
  $("#newPlaylistName").value = "";
  $("#playlistDialog").showModal();
}

function addCurrentToPlaylist(event) {
  event.preventDefault();
  const song = getCurrentSong();
  if (!song) return;
  const name = $("#newPlaylistName").value.trim();
  let playlist = name
    ? { id: Date.now(), name, songIds: [] }
    : state.playlists.find((item) => String(item.id) === $("#playlistSelect").value);

  if (!playlist) {
    toast("Escolha ou crie uma playlist");
    return;
  }
  if (name) state.playlists.push(playlist);
  if (!playlist.songIds.some((id) => String(id) === String(song.id))) playlist.songIds.push(song.id);
  save();
  $("#playlistDialog").close();
  renderStats();
  toast("Adicionado à playlist");
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;"
  }[char]));
}

function toast(message) {
  const element = $("#toast");
  element.textContent = message;
  element.classList.add("show");
  clearTimeout(element.timer);
  element.timer = setTimeout(() => element.classList.remove("show"), 1800);
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  }
}

boot();
