const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('index.html', 'utf8');

assert.match(html, /\.song-controls\{border:0;background:#111111\}/);
assert.match(html, /\.song-controls\.is-expanded\{[^}]*border:0;[^}]*border-radius:0;[^}]*background:transparent\}/);
assert.match(html, /\.song-controls\.is-expanded \.song-control-strip\{border-bottom:0;background:#111111\}/);
assert.match(html, /\.song-control-panel\{[^}]*border:0;[^}]*border-radius:0 0 16px 16px;[^}]*background:#111111\}/);
assert.match(html, /#view-detail:not\(\.stage-mode\)\{background:#050505\}/);
assert.match(html, /\.video-study-expanded>\.detail-header\{[^}]*border-bottom:0;/, 'o cabeçalho compacto do estudo não deve exibir linha inferior');

console.log('study-toolbar-surface.test.js: OK');
