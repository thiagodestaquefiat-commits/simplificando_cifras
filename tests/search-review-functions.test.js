// A busca (js/ai/ai-harmonic-summary.js e a busca da playlist) chama funções globais do index.html.
// Uma integração já removeu essas funções e a busca quebrou com "reviewSearchedSong is not defined".
const assert = require("node:assert/strict");
const fs = require("node:fs");
const html = fs.readFileSync("index.html", "utf8");
for (const name of ["reviewSearchedSong", "playlistContainsSong", "openAiDraft", "closePlaylistSearch", "commitSongs", "saveDetailChanges", "openSongQuickPicker"]) {
  assert.match(html, new RegExp(`function ${name}\\s*\\(`), `index.html precisa definir ${name}()`);
}
assert.match(html, /youtubeApi\.searchVideos\(query,6\)/, "a busca externa usa resultados reais para obter artista e data");
assert.match(html, /videos\.map\(video=>\(\{\.\.\.video,catalog:true/, "resultados de vídeo seguem pelo fluxo seguro do catálogo");
console.log("search-review-functions.test.js: OK (funções usadas pela busca existem)");
