const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function element() {
  const attrs = {};
  const classes = new Set();
  const handlers = {};
  return {
    textContent: '',
    attrs,
    classes,
    handlers,
    classList: {
      add: value => classes.add(value),
      remove: value => classes.delete(value),
      toggle: (value, on) => on ? classes.add(value) : classes.delete(value)
    },
    setAttribute: (key, value) => { attrs[key] = value; },
    addEventListener: (key, handler) => { handlers[key] = handler; },
    click() { handlers.click(); }
  };
}

(async () => {
  const controls = Object.fromEntries(['#metronome-bpm', '#metronome-play', '#metronome-minus', '#metronome-plus', '#metronome-meter', '.metronome-beats'].map(key => [key, element()]));
  const beats = Array.from({ length: 6 }, element);
  const root = element();
  root.querySelector = key => controls[key];
  root.querySelectorAll = () => beats;
  const saved = new Map();
  const storage = {
    get: (key, fallback) => saved.has(key) ? saved.get(key) : fallback,
    set: (key, value) => { saved.set(key, value); return true; }
  };
  const played = [];
  const gainParam = () => ({ cancelScheduledValues() {}, setValueAtTime() {}, exponentialRampToValueAtTime() {} });
  class FakeAudioContext {
    constructor() { this.currentTime = 10; this.destination = {}; }
    async resume() {}
    createGain() { return { gain: gainParam(), connect() {}, disconnect() {} }; }
    createOscillator() {
      return {
        frequency: { value: 0 }, connect() {}, disconnect() {}, stop() {},
        start(time) { played.push(time); }
      };
    }
  }
  let interval = null;
  const window = {
    AudioContext: FakeAudioContext,
    setInterval: handler => { interval = handler; return 1; },
    clearInterval: () => { interval = null; },
    setTimeout: () => 1,
    clearTimeout: () => {}
  };
  const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'study-metronome.js'), 'utf8');
  vm.runInNewContext(source, { window });
  const errors = [];
  const metronome = window.studyMetronome.create(root, storage, message => errors.push(message));

  metronome.setSong('song-1', 'user-1');
  assert.equal(metronome.getBpm(), 72);
  assert.equal(metronome.getMeter(), '4/4');
  assert.equal(beats.filter(beat => !beat.hidden).length, 4);
  controls['#metronome-plus'].click();
  assert.equal(metronome.getBpm(), 73);
  assert.equal(saved.get('study-metronome-bpm-v1')['user-1:song-1'], 73);
  controls['#metronome-meter'].value = '3/4';
  controls['#metronome-meter'].handlers.change();
  assert.equal(metronome.getMeter(), '3/4');
  assert.equal(beats.filter(beat => !beat.hidden).length, 3);
  assert.equal(saved.get('study-metronome-meter-v1')['user-1:song-1'], '3/4');
  controls['#metronome-play'].click();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(metronome.isPlaying(), true);
  assert.ok(played.length > 0, 'primeiro clique deve ser agendado');
  assert.equal(controls['#metronome-play'].attrs['aria-pressed'], 'true');
  controls['#metronome-play'].click();
  assert.equal(metronome.isPlaying(), false);
  assert.equal(interval, null);
  metronome.setSong('song-2', 'user-1');
  assert.equal(metronome.getBpm(), 72);
  assert.equal(metronome.getMeter(), '4/4');
  metronome.setSong('song-1', 'user-1');
  assert.equal(metronome.getBpm(), 73);
  assert.equal(metronome.getMeter(), '3/4');
  controls['#metronome-meter'].value = '6/8';
  controls['#metronome-meter'].handlers.change();
  assert.equal(beats.filter(beat => !beat.hidden).length, 6);
  assert.deepEqual(errors, []);
  console.log('study-metronome: OK (clique agendado, controles, pausa e BPM por música)');
})().catch(error => { console.error(error); process.exitCode = 1; });
