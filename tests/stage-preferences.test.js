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
assert.equal(bounded.autoScrollSpeed, 6);
assert.equal(bounded.theme, 'dark');

console.log('stage-preferences.test.js: OK');
assert.equal(preferences.formatScrollSpeed(preferences.load('new-user').autoScrollSpeed),'0,50x');
assert.equal(preferences.normalizeScrollSpeed(140),120);
assert.equal(preferences.normalizeScrollSpeed(38),39);
for(let speed=6;speed<=120;speed+=3){
  assert.match(preferences.formatScrollSpeed(speed),/^\d,\d{2}x$/);
  assert.equal(preferences.normalizeScrollSpeed(speed),speed);
}
preferences.save('speed-user',{autoScrollSpeed:39});
assert.equal(preferences.formatScrollSpeed(preferences.load('speed-user').autoScrollSpeed),'0,65x');
assert.equal(preferences.load('another-user').autoScrollSpeed,30);
for(const missing of [undefined,null,'',NaN,'invalid'])assert.equal(preferences.normalizeScrollSpeed(missing),30);
assert.equal(preferences.formatScrollSpeed(-100),'0,10x');
assert.equal(preferences.formatScrollSpeed(999),'2,00x');

for(const speed of [6,9,24,30,39,60,117,120]){
  memory.set(preferences.STORAGE_KEY,JSON.stringify({'legacy-user':{autoScrollSpeed:speed}}));
  const before=memory.get(preferences.STORAGE_KEY);
  assert.equal(preferences.load('legacy-user').autoScrollSpeed,speed);
  assert.equal(memory.get(preferences.STORAGE_KEY),before,'loading must not rewrite saved preferences');
}
for(let step=2;step<=40;step++)assert.equal(preferences.formatScrollSpeed(step*3),(step*0.05).toFixed(2).replace('.',',')+'x');
