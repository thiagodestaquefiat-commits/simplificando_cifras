const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('index.html', 'utf8');

assert.match(html, /function initializeEventFilterDrag\(\)/);
assert.match(html, /addEventListener\('pointerdown'/);
assert.match(html, /addEventListener\('pointermove'/);
assert.match(html, /addEventListener\('pointerup'/);
assert.match(html, /setPointerCapture\(pointer\.pointerId\)/);
assert.match(html, /\['all','upcoming','past'\]\[drag\.index\]/);
assert.match(html, /touch-action:pan-y/);
assert.match(html, /@media\(max-width:600px\)\{\.event-filter-segments\{width:calc\(100vw - 28px\);max-width:none\}\}/);
assert.match(html, /\.event-filter-segments\.is-dragging \.event-filter-indicator\{transition:none\}/);

const finalTrackRule = html.match(/\.event-filter-segments\{border:0;box-shadow:0 7px 24px[^}]+\}/);
assert.ok(finalTrackRule, 'track final deve remover borda de contorno');
const finalIndicatorRule = html.match(/\.event-filter-indicator\{border:0;background:rgba\(210,214,220,.18\);box-shadow:0 1px 3px[^}]+\}/);
assert.ok(finalIndicatorRule, 'indicador final deve remover borda e highlight de contorno');
assert.match(html, /\.event-filter-segments,.event-filter-segments:focus,.event-filter-segments:focus-visible\{border:none!important;outline:none!important;box-shadow:none!important\}/);
assert.match(html, /\.event-filter-indicator\{border:none!important;outline:none!important;box-shadow:none!important\}/);

console.log('event-filter-drag.test.js: OK');
