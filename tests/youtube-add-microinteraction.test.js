const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const source = fs.readFileSync(path.join(root, "js", "youtube-ui.js"), "utf8");

assert.match(html, /\.youtube-add-btn\{[^}]*width:44px[^}]*height:44px/);
assert.match(html, /@keyframes youtube-add-check-spring/);
assert.match(html, /scale\(1\.11\)/);
assert.match(html, /@media\(prefers-reduced-motion:reduce\)/);
assert.match(source, /youtube-add-btn-icon--plus/);
assert.match(source, /youtube-add-btn-icon--check/);
assert.match(source, /isAlreadyAdded\(video\)/);
assert.match(source, /aria-pressed/);
assert.match(source, /Adicionar “\$\{title\}” à playlist/);
assert.match(source, /“\$\{title\}” adicionada à playlist/);
assert.match(source, /classList\.contains\("is-pending"\)/);
assert.doesNotMatch(source, /Música adicionada com vídeo do YouTube/);

console.log("youtube-add-microinteraction.test.js: OK");
