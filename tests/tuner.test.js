const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const context = { window: {}, Float32Array, Float64Array, Math, Number, Object, Promise };
vm.createContext(context);
vm.runInContext(fs.readFileSync('js/tuner.js', 'utf8'), context);
const tuner = context.window.appTuner;

function wave(frequency, sampleRate = 48000, amplitude = 0.25) {
  const samples = new Float32Array(8192);
  for (let i = 0; i < samples.length; i++) {
    const phase = 2 * Math.PI * frequency * i / sampleRate;
    samples[i] = amplitude * (Math.sin(phase) + 0.2 * Math.sin(2 * phase));
  }
  return samples;
}

for (const [instrument, strings] of Object.entries(tuner.instruments)) {
  for (const string of strings) {
    const measured = tuner.analyzePitch(wave(string.frequency), 48000);
    assert.ok(measured && Math.abs(1200 * Math.log2(measured / string.frequency)) < 8,
      `${instrument} ${string.note} deve ser reconhecida com margem inferior a 8 cents: ${measured}`);
  }
}
assert.deepEqual(Object.keys(tuner.instruments), ['guitar', 'ukulele', 'bass', 'violin']);
assert.equal(tuner.analyzePitch(new Float32Array(4096), 48000), null, 'silêncio não é nota');
assert.equal(tuner.analyzePitch(wave(440, 48000, 0.001), 48000), null, 'ruído muito baixo não é nota');
assert.equal(tuner.noteForFrequency(440).name, 'A');
assert.equal(tuner.noteForFrequency(440).octave, 4);
assert.ok(Math.abs(tuner.noteForFrequency(440, 440).cents) < 0.001);
assert.ok(tuner.noteForFrequency(430, 440).cents < 0, 'nota baixa deve indicar ponteiro à esquerda');
assert.ok(tuner.noteForFrequency(450, 440).cents > 0, 'nota alta deve indicar ponteiro à direita');

let resolvePermission;
let stopped = 0;
const track = { stop: () => { stopped++; } };
const stream = { getTracks: () => [track] };
const pending = tuner.create({ mediaDevices: { getUserMedia: () => new Promise(resolve => { resolvePermission = resolve; }) }, AudioContext: class {} });
const startPromise = pending.start(() => {});
pending.stop();
resolvePermission(stream);
startPromise.then(result => {
  assert.equal(result, false, 'fechar durante a permissão não deve ativar o microfone');
  assert.equal(stopped, 1, 'o stream pendente deve ser desligado');
  const html = fs.readFileSync('index.html', 'utf8');
  assert.match(html, /onclick="openTuner\(\)"/);
  assert.match(html, /function closeModal\(\)\{stopTuner\(\)/);
  assert.match(html, /window\.addEventListener\('pagehide',\(\)=>tunerController\.stop\(\)\)/);
  console.log('tuner.test.js: OK (4 instrumentos, silêncio, cents e ciclo do microfone)');
}).catch(error => { console.error(error); process.exitCode = 1; });
