const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const source = fs.readFileSync(path.join(root, "js", "ai", "ai-harmonic-summary.js"), "utf8");
const youtubeSource = fs.readFileSync(path.join(root, "js", "youtube-ui.js"), "utf8");

assert.match(html, /\.playlist-search-add-btn\{[^}]*width:44px[^}]*height:44px/);
assert.match(html, /@keyframes youtube-add-check-spring/);
assert.match(html, /scale\(1\.11\)/);
assert.match(html, /@media\(prefers-reduced-motion:reduce\)/);
assert.match(source, /youtube-add-btn-icon--plus/);
assert.match(source, /youtube-add-btn-icon--check/);
assert.match(source, /searchCandidateAdded\(candidate,title,artist\)/);
assert.match(source, /aria-pressed/);
assert.match(source, /Adicionar “\$\{name\}” à playlist/);
assert.match(source, /“\$\{name\}” adicionada à playlist/);
assert.match(source, /classList\.add\("is-pending"\)/);
// A busca não salva sozinha: abre a música para o usuário conferir antes de entrar na playlist.
assert.match(source, /reviewSearchedSong\(model\)/);
assert.doesNotMatch(source, /saveAiGeneratedSong\(model, \{ open: false/);
assert.match(youtubeSource, /element\("button", "youtube-add-btn", "Adicionar"\)/);
assert.match(html, /function schedulePlaylistOnlineSearch/);
assert.match(html, /harmonicSummaryClient\.searchSources\(query,''\)/);
assert.match(html, /harmonicSummaryClient\.generate\('pesquisa'/);
assert.match(html, /data-playlist-online-results/);

console.log("youtube-add-microinteraction.test.js: OK");
