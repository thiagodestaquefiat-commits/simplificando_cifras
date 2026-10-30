// Perfil do catálogo nas sugestões de fechamento: desempata por subgênero/BPM e barra sacra x secular.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const context = { console };
vm.createContext(context);
vm.runInContext(fs.readFileSync('js/closing-suggestions.js', 'utf8'), context);
const { closingSuggestions } = context;

const lyrics = 'No calvário Jesus morreu por mim\nSeu sangue me lavou na cruz\nO Cordeiro foi ferido em meu lugar\nSua graça me alcançou e o perdão me libertou\nNa cruz eu encontrei a vida';
const song = (id, title, extra = {}) => ({ id, title, key: 'D', updatedAt: '1', blocos: lyrics.split('\n').map(l => ({ l, c: '' })), ...extra });
const reference = song(1, 'Referência');
const lenta = song(2, 'Lenta Congregacional');
const rapida = song(3, 'Celebração Rápida');
const secular = song(4, 'Rock Parecido');
const semPerfil = song(5, 'Sem Perfil');
const profiles = {
  'Referência': { genero: 'Louvor e Adoração', subgenero: 'Adoração congregacional', bpm: 70, sacra: true },
  'Lenta Congregacional': { genero: 'Louvor e Adoração', subgenero: 'Adoração congregacional', bpm: 72, sacra: true },
  'Celebração Rápida': { genero: 'Louvor e Adoração', subgenero: 'Celebração', bpm: 130, sacra: true },
  'Rock Parecido': { genero: 'Rock', subgenero: 'Rock nacional', bpm: 70, sacra: false }
};
const profileOf = (item) => profiles[item.title] || null;
const candidates = [rapida, secular, semPerfil, lenta];

const withProfile = closingSuggestions.suggest({ reference, targetKey: 'D', candidates, limit: 3, profileOf });
const ids = withProfile.map(item => item.song.id);
assert.equal(ids[0], 2, 'mesmo subgênero e BPM próximo vem primeiro');
assert.ok(!ids.includes(4), 'música secular nunca encerra culto');
assert.ok(ids.includes(5), 'música sem perfil continua valendo pelo tema da letra');

const plain = closingSuggestions.suggest({ reference, targetKey: 'D', candidates, limit: 4 });
assert.equal(plain.length, 4, 'sem perfil (offline/sem login) funciona como antes');

const bpmFromSong = closingSuggestions.suggest({ reference, targetKey: 'D', candidates: [rapida, song(6, 'Mesma Letra', { bpm: 68 })], limit: 2, profileOf });
assert.equal(bpmFromSong[0].song.id, 6, 'BPM salvo na própria música também conta');

// Cache de perfis: chave por título + artista + tom, sem duplicar pedidos.
const calls = [];
const window = {
  navigator: { onLine: true },
  appAuth: { getAccessToken: () => 'token' },
  apiConfig: { sharedSongsEndpoint: (path) => 'http://api.test/api/shared-songs/' + path },
  fetch: async (url, options) => { calls.push(JSON.parse(options.body)); return { ok: true, json: async () => ({ profiles: [{ genero: 'Gospel', bpm: 90 }, null] }) }; }
};
const ctx2 = { window, Promise, Map, Set, JSON, String, Array };
vm.createContext(ctx2);
vm.runInContext(fs.readFileSync('js/song-profiles.js', 'utf8'), ctx2);
(async () => {
  let updates = 0;
  const songs = [{ title: 'Águas Purificadoras', artist: 'Diante do Trono', key: 'G' }, { title: 'Outra', key: 'A' }];
  assert.equal(await window.songProfiles.prefetch(songs, () => { updates += 1; }), true);
  assert.equal(window.songProfiles.get({ title: 'aguas purificadoras', artist: 'Diante do Trono', originalKey: 'G' }).bpm, 90);
  assert.equal(window.songProfiles.get(songs[1]), null);
  assert.equal(await window.songProfiles.prefetch(songs), false, 'não pede de novo');
  assert.equal(calls.length, 1);
  assert.equal(updates, 1);
  window.songProfiles.clear();
  assert.equal(window.songProfiles.get(songs[0]), null, 'sair da conta limpa o cache');
  window.appAuth.getAccessToken = () => null;
  assert.equal(await window.songProfiles.prefetch(songs), false, 'sem login não chama o servidor');
  console.log('song-profiles.test.js: OK (subgênero, BPM, sacra x secular, cache e sem login)');
})().catch((error) => { console.error(error); process.exit(1); });
