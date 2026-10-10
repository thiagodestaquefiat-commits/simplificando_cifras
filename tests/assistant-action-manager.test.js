const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const sandbox = { window: {} };
for (const file of ['assistant-actions.js', 'assistant-action-manager.js', 'assistant-action-runtime.js']) vm.runInNewContext(fs.readFileSync(`js/${file}`, 'utf8'), sandbox);
const { roudyAssistantActions, roudyActionManager, roudyAssistantRuntime } = sandbox.window;
const clean = text => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

(async () => {
  let state = { ownerId: 'A', authSubject: 'A', libraryOwner: 'A', ready: true, screen: 'song', songOpen: true, songId: 1, eventId: null, itemId: null, canEditSong: true, smartActive: false, autoActive: false, metronomeActive: false, events: [], eventsAll: [] };
  let bpm = 72, playing = false, capo = 0, semitones = 0, dirty = false, saved = 0, legacy = 0, youtube = 0, searches = 0, holdSave;
  const calls = [];
  const songs = [{ id: 1, title: 'Canção', artist: 'A' }, { id: 2, title: 'Não Pare', artist: 'B' }];
  const matches = query => songs.filter(song => clean(song.title) === query);
  const tool = { getBpm: () => bpm, setBpm: value => { bpm = value;dirty = true;calls.push('bpm'); }, getMeter: () => tool.meter, setMeter: value => { tool.meter = value; }, isPlaying: () => playing, stop: () => { playing = false;state.metronomeActive = false; } };
  const host = {
    context: () => ({ ...state }), clean, localDate: value => value, songMatches: matches,
    legacy: async () => { legacy++;return { ok: true, message: 'legacy' }; },
    home: tab => { state.screen = tab;state.songOpen = false; }, isHome: tab => state.screen === tab,
    openSong: song => { state.songOpen = true;state.songId = song.id;state.screen = 'song'; }, isSongOpen: id => state.songOpen && state.songId === id,
    openEvent: event => { state.screen = 'event';state.eventId = event.id;state.songOpen = false; }, isEventOpen: id => state.screen === 'event' && state.eventId === id,
    resolveEvent: async () => ({ action: 'inform', message: 'Sem eventos.' }),
    capo: () => capo, semitones: () => semitones, selectCapo: value => { capo = value;dirty = true;calls.push('capo'); }, transpose: delta => { semitones += delta;dirty = true;calls.push('transpose'); }, resetTranspose: () => { semitones = 0; },
    isDirty: () => dirty, saveSong: async () => { saved++;if (holdSave) await holdSave;dirty = false;return { ok: true }; },
    metronome: () => tool, showMetronome() {}, metronomeVisible: () => true,
    startMetronome: () => { playing = true;state.metronomeActive = true; },
    scrollActive: mode => mode === 'smart' ? state.smartActive : state.autoActive,
    setScrolling: (mode, value) => { state[mode === 'smart' ? 'smartActive' : 'autoActive'] = value; },
    searchPlaylist: query => { searches++;host.query = query; }, playlistQuery: () => host.query,
    searchYoutube: async () => { youtube++;return { ok: true, count: 2 }; }
  };
  const catalog = roudyAssistantActions.create({ songMatches: matches, eventDate: () => null, classify: () => null });
  const runtime = roudyAssistantRuntime.create(host);
  const manager = roudyActionManager.create({ catalog, runtime, normalize: clean, numbers: text => text });
  assert.ok(manager.getCatalog().length >= 18);
  for (const command of ['não excluir música', 'eu não quero excluir música', 'nunca iniciar metrônomo', 'iniciar metrônomo e parar rolagem', 'iniciar metrônomo e rolagem', 'capotraste 3; salvar']) {
    assert.equal((await manager.run(command)).ok, false, command);
  }
  assert.equal(legacy, 0);assert.deepEqual(calls, []);
  assert.equal((await manager.run('abrir Não Pare')).ok, true, 'negation inside an explicit song title is not an instruction');
  state.songId = 1;
  assert.equal((await manager.run('buscar no YouTube Canção')).action, 'search.youtube');
  assert.equal(youtube, 1);assert.equal(searches, 0);assert.equal(legacy, 0);
  assert.equal((await manager.run('buscar Canção')).action, 'search.playlist');assert.equal(searches, 1);
  for (const command of ['capotraste -2', 'capotraste 13', 'metrônomo -40', 'bpm 241', 'bpm 90,5', 'aumentar metronomo para 1000', 'subir tom 2', 'capotraste na casa 2 5']) assert.equal((await manager.run(command)).ok, false, command);
  assert.equal(capo, 0);assert.equal(bpm, 72);
  state.canEditSong = false;
  assert.equal((await manager.run('capotraste 2')).ok, false);
  assert.equal((await manager.run('bpm 90')).ok, false);
  state.canEditSong = true;
  assert.equal((await manager.run('capotraste 2')).ok, true);assert.equal(capo, 2);
  await manager.run('subir tom', { requestId: 'first' });
  assert.equal((await manager.run('subir tom', { requestId: 'first' })).duplicate, true);assert.equal(semitones, 1);
  await manager.run('subir tom', { requestId: 'second' });assert.equal(semitones, 2, 'a new click is a new intentional change');
  await manager.run('iniciar metronomo');state.smartActive = true;
  assert.equal((await manager.run('parar')).status, 'clarify');assert.equal(playing, true);assert.equal(state.smartActive, true);
  await manager.run('parar metronomo');assert.equal(playing, false);
  await manager.run('parar');assert.equal(state.smartActive, false);
  host.startMetronome = () => {};
  assert.equal((await manager.run('iniciar metronomo')).ok, false, 'no success when audio fails');
  tool.setBpm = () => {};
  assert.equal((await manager.run('bpm 100')).ok, false, 'no success when the controller does not change');
  assert.equal((await manager.run('salvar alteracoes')).ok, true);assert.equal(saved, 1);assert.equal(dirty, false);
  assert.equal((await manager.run('salvar alteracoes')).status, 'noop');assert.equal(saved, 1);
  state.eventId = 'event-1';state.itemId = 'item-1';dirty = true;
  assert.equal((await manager.run('salvar na playlist')).ok, false, 'an event draft is not saved to playlist just by an ambiguous target');
  state.eventId = null;state.itemId = null;
  assert.equal((await manager.run('salvar no evento')).ok, false, 'a playlist draft is not saved to an unrelated event');
  host.saveSong = async () => ({ ok: false });dirty = true;
  assert.equal((await manager.run('salvar alteracoes')).ok, false);assert.equal(dirty, true);
  let release;
  holdSave = new Promise(resolve => { release = resolve; });
  host.saveSong = async () => { await holdSave;return { ok: true }; };
  const pending = manager.run('salvar alteracoes');
  assert.equal((await manager.run('subir tom')).ok, false, 'no overlapping action');
  state.ownerId = 'B';state.authSubject = 'B';state.libraryOwner = 'B';release();
  assert.equal((await pending).ok, false, 'old account response cannot announce success');
  assert.equal(manager.getLastResult(), null, 'no previous account result is exposed to the new account');
  state.ready = false;
  assert.equal((await manager.run('abrir Canção')).ok, false);
  console.log('assistant-action-manager: OK (catalog, conflicts, negation, parameters, context, duplicate requests and verified results)');
})().catch(error => { console.error(error);process.exitCode = 1; });
