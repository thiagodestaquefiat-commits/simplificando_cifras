// Compartilhar música por link (estilo Spotify): quem envia gera uma cópia fixa;
// quem recebe abre sem conta e salva uma cópia só dele.
const assert = require("node:assert/strict");

const posts = [];
const stored = new Map();
let sharedUrl = null;
let sheetHtml = "";
let toastMessage = "";
let opened = null;
let gatePassed = false;
let token = "token-lider";

global.window = global;
global.location = { href: "https://simplificandocifras.netlify.app/" };
global.history = { state: null, replaceState(_s, _t, url) { global.location.href = url; } };
Object.defineProperty(global, "navigator", { configurable: true, value: { onLine: true, share: async ({ url }) => { sharedUrl = url; }, clipboard: { writeText: async () => {} } } });
global.apiConfig = { API_BASE_URL: "https://api.example" };
global.appAuth = { getAccessToken: () => token };
global.showToast = (message) => { toastMessage = message; };
global.eventSongCopy = (song, state) => ({ ...song, key: state.semitones ? "A" : song.key, capo: state.capo ?? song.capo, playbackSettings: { semitones: 0 } });
global.songFormat = { fromLegacy: (song) => ({ fullChordSheet: { content: song.cifra } }), simpleText: () => "" };
global.eventAdminHeader = (title, action) => `<header>${title}|${action}</header>`;
global.showEventAdminSheet = (html) => { sheetHtml = html; };
global.closeEventAdminSheet = () => {};
global.eventAdminSheetState = null;
global.songModel = {
  create: (value) => ({ ...value }),
  findDuplicate: (list, candidate) => list.find((song) => song.title === candidate.title && song.artist === candidate.artist) || null
};
global.musicas = [];
global.commitSongs = (next) => { global.musicas = next; return true; };
global.renderMusicas = () => {};
global.openDetail = (id) => { opened = id; };
global.continueWithoutLogin = () => { gatePassed = true; };
global.fetch = async (url, options = {}) => {
  if (options.method === "POST") {
    const body = JSON.parse(options.body);
    posts.push({ url, body, auth: options.headers.Authorization });
    stored.set("abc-123", body);
    return { ok: true, status: 201, async json() { return { id: "abc-123" }; } };
  }
  const id = url.split("/").pop();
  const data = stored.get(id);
  return data
    ? { ok: true, status: 200, async json() { return { id, playlist: data }; } }
    : { ok: false, status: 404, async json() { return { erro: { mensagem: "Playlist não encontrada." } }; } };
};

require("../js/song-share.js");

(async () => {
  // 1) Quem envia: link com cópia fixa no tom atual, sem dados de sincronização da biblioteca.
  const original = { id: "song-1", title: "Isaías 9", artist: "Fernandinho", key: "D", capo: 2, cifra: "C G Am F", librarySync: { clientId: "x" } };
  await window.songShare.share(original, { semitones: 7 });
  assert.equal(posts.length, 1);
  assert.equal(posts[0].url, "https://api.example/api/shared-playlists");
  assert.equal(posts[0].auth, "Bearer token-lider");
  const sent = posts[0].body.items[0].song;
  assert.equal(sent.key, "A", "envia no tom de quem compartilhou");
  assert.equal(sent.librarySync, undefined, "não envia metadados da biblioteca");
  assert.equal(sent.id, undefined, "não envia o id da biblioteca de quem enviou");
  assert.equal(sharedUrl, "https://simplificandocifras.netlify.app/?musica=abc-123");

  // Quem envia altera a música depois: o link continua com a cópia antiga.
  original.cifra = "MUDOU";
  assert.equal(stored.get("abc-123").items[0].song.cifra, "C G Am F");

  // 2) Quem recebe, sem conta: abre o link, vê a música e salva uma cópia só dele.
  token = null;
  global.location.href = sharedUrl;
  window.songShare.checkLink();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.ok(gatePassed, "abre mesmo sem conta");
  assert.ok(!global.location.href.includes("musica="), "remove o parâmetro do endereço");
  assert.match(sheetHtml, /Isaías 9/);
  assert.match(sheetHtml, /Tom A/);
  assert.match(sheetHtml, /C G Am F/, "mostra a cifra antes de salvar");

  window.songShare.save();
  assert.equal(global.musicas.length, 1);
  const saved = global.musicas[0];
  assert.match(saved.id, /^shared_/, "a cópia ganha id próprio de quem recebeu");
  assert.equal(saved.key, "A");
  assert.equal(opened, saved.id, "abre a música salva");

  // 3) Abrir de novo e salvar: não duplica na biblioteca.
  global.location.href = sharedUrl;
  window.songShare.checkLink();
  await new Promise((resolve) => setTimeout(resolve, 0));
  window.songShare.save();
  assert.equal(global.musicas.length, 1, "não duplica");
  assert.match(toastMessage, /já tem/);

  // 4) Sem conta, quem tenta enviar recebe o compartilhamento só em texto.
  sharedUrl = "não usado";
  await window.songShare.share(original);
  assert.equal(posts.length, 1, "sem conta não cria link");

  console.log("song-share.test.js: OK");
})().catch((error) => { console.error(error); process.exit(1); });
