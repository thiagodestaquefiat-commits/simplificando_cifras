const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('index.html', 'utf8');
const source = html.slice(html.indexOf('function openProfilePhotoEditor('), html.indexOf('function removeProfilePhoto('));

assert.match(source, /Mover e dimensionar/, 'o ajuste deve abrir diretamente na interface de gesto');
assert.match(source, /Arraste para mover · use dois dedos para ampliar/, 'a interface deve explicar os gestos disponíveis');
assert.match(source, /pointers:new Map\(\)/, 'o editor deve acompanhar múltiplos dedos');
assert.match(source, /mode:'pinch'/, 'o editor deve reconhecer pinça');
assert.match(source, /distance\(points\[0\],points\[1\]\)/, 'o zoom deve acompanhar a distância entre os dedos');
assert.match(source, /clampProfilePhotoEditor\(\)/, 'a imagem não deve revelar área vazia ao ser arrastada');
assert.doesNotMatch(source, /Recortar e ajustar/, 'o painel lateral antigo não deve ser exibido');
assert.doesNotMatch(source, /profile-image-zoom" type="range/, 'o ajuste não deve depender de slider de zoom');
assert.match(html, /\.profile-crop-canvas-wrap\{[^}]*touch-action:none/, 'a área de recorte deve controlar os gestos de toque');

console.log('profile-photo-touch-editor.test.js: OK (arraste, pinça e interface contínua)');
