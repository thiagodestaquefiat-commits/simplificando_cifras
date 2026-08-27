const assert = require('node:assert/strict');

const memory = new Map();
global.window = {
  localStorage: {
    getItem(key) { return memory.has(key) ? memory.get(key) : null; },
    setItem(key, value) { memory.set(key, String(value)); }
  }
};

require('../js/stage-offline.js');
const offline = window.stageOffline;

const pack = offline.prepare({
  userId: 'musico-1',
  contextId: 'evento-1',
  event: { id: 'evento-1', title: 'Culto', leaderId: 'lider-1' },
  songs: [
    { id: 10, title: 'Primeira', key: 'G', blocos: [{ l: 'Verso', c: 'G C' }], personalNotes: 'Entrada suave', spotifyTrack: { uri: 'spotify:track:x' } },
    { id: 20, title: 'Segunda', key: 'A', fullChordSheet: { content: 'A D' } }
  ],
  preferences: { contentMode: 'lyrics-chords' }
});

assert.deepEqual(pack.order, [10, 20]);
assert.equal(pack.songs[0].personalNotes, 'Entrada suave');
assert.equal('spotifyTrack' in pack.songs[0], false, 'o pacote deve conter apenas o necessário para o palco');
assert.equal(offline.isReady('musico-1', 'evento-1', [10, 20]), true);
assert.equal(offline.isReady('musico-2', 'evento-1', [10]), false, 'pacotes pessoais não devem vazar entre usuários');

console.log('stage-offline.test.js: OK');
