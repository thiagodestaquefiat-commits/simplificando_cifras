// A busca (js/ai/ai-harmonic-summary.js e a busca da playlist) chama funções globais do index.html.
// Uma integração já removeu essas funções e a busca quebrou com "reviewSearchedSong is not defined".
const assert = require("node:assert/strict");
const fs = require("node:fs");
const html = fs.readFileSync("index.html", "utf8");
for (const name of ["reviewSearchedSong", "playlistContainsSong", "openAiDraft", "closePlaylistSearch", "commitSongs", "saveDetailChanges", "openSongQuickPicker"]) {
  assert.match(html, new RegExp(`function ${name}\\s*\\(`), `index.html precisa definir ${name}()`);
}
assert.doesNotMatch(html, /youtubeApi\.searchVideos\(query/, "busca da playlist: Cifra Club, banco ROUDY e playlist — sem YouTube (Thiago, 13/10)");
console.log("search-review-functions.test.js: OK (funções usadas pela busca existem)");
