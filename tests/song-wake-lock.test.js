// Tela acesa enquanto uma música estiver aberta (estudo e Palco), decisão do Thiago em 06/11/2026.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const html = fs.readFileSync("index.html", "utf8");
assert.match(html, /let songWakeLock=null/);
assert.match(html, /function songScreenOpen\(\)/);
assert.match(html, /new MutationObserver\(\(\)=>syncSongWakeLock\(\)\)\.observe\(vd,\{attributes:true,attributeFilter:\['style','class'\]\}\)/, "observa a própria tela da música, em qualquer caminho");
assert.match(html, /document\.addEventListener\('visibilitychange',\(\)=>syncSongWakeLock\(\)\)/, "solta em segundo plano e pede de novo ao voltar");
assert.match(html, /navigator\.wakeLock\.request\('screen'\)/);
assert.match(html, /async function acquireStageWakeLock\(\)/, "o Palco continua com o próprio pedido de tela acesa");
console.log("song-wake-lock.test.js: OK");
