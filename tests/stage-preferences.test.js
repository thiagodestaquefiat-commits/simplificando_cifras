const assert = require('node:assert/strict');

const memory = new Map();
global.window = {
  localStorage: {
    getItem(key) { return memory.has(key) ? memory.get(key) : null; },
    setItem(key, value) { memory.set(key, String(value)); }
  }
};

require('../js/stage-preferences.js');
const preferences = window.stagePreferences;

assert.equal(preferences.detectPreset('Vocal'), 'vocal');
assert.equal(preferences.detectPreset('Violão'), 'guitar');
assert.equal(preferences.detectPreset('Contra-baixo'), 'bass');
assert.equal(preferences.detectPreset('Tecladista'), 'keys');
assert.equal(preferences.detectPreset('Baterista'), 'drums');

const vocal = preferences.defaultsFor('Cantora');
assert.equal(vocal.preset, 'vocal');
assert.equal(vocal.contentMode, 'lyrics');

const saved = preferences.save('user-1', { ...vocal, fontSize: 40, theme: 'contrast' });
assert.equal(saved.fontSize, 40);
assert.equal(preferences.load('user-1').theme, 'contrast');
assert.equal(preferences.listProfiles('user-1').length, 1);
preferences.save('user-1', { ...saved, theme: 'light' }, 'ensaio');
assert.equal(preferences.listProfiles('user-1').length, 2, 'a estrutura deve aceitar vários perfis pessoais no futuro');
assert.equal(preferences.load('user-1').theme, 'light');
assert.notEqual(preferences.load('user-2', 'Bateria').contentMode, preferences.load('user-1').contentMode);

const bounded = preferences.normalize({ fontSize: 100, autoScrollSpeed: 2, theme: 'invalid' });
assert.equal(bounded.fontSize, 48);
assert.equal(bounded.autoScrollSpeed, 24);
assert.equal(bounded.theme, 'dark');

console.log('stage-preferences.test.js: OK');
