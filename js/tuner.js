(function (global) {
  'use strict';

  const NOTE_NAMES = Object.freeze(['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']);
  const GUITAR_STRINGS = Object.freeze([
    { note: 'E2', frequency: 82.4069, label: 'Mi' },
    { note: 'A2', frequency: 110, label: 'Lá' },
    { note: 'D3', frequency: 146.8324, label: 'Ré' },
    { note: 'G3', frequency: 195.9977, label: 'Sol' },
    { note: 'B3', frequency: 246.9417, label: 'Si' },
    { note: 'E4', frequency: 329.6276, label: 'Mi' }
  ]);
  const INSTRUMENTS = Object.freeze({
    guitar: GUITAR_STRINGS,
    ukulele: Object.freeze([
      { note: 'G4', frequency: 391.9954, label: 'Sol' },
      { note: 'C4', frequency: 261.6256, label: 'Dó' },
      { note: 'E4', frequency: 329.6276, label: 'Mi' },
      { note: 'A4', frequency: 440, label: 'Lá' }
    ]),
    bass: Object.freeze([
      { note: 'E1', frequency: 41.2034, label: 'Mi' },
      { note: 'A1', frequency: 55, label: 'Lá' },
      { note: 'D2', frequency: 73.4162, label: 'Ré' },
      { note: 'G2', frequency: 97.9989, label: 'Sol' }
    ]),
    violin: Object.freeze([
      { note: 'G3', frequency: 195.9977, label: 'Sol' },
      { note: 'D4', frequency: 293.6648, label: 'Ré' },
      { note: 'A4', frequency: 440, label: 'Lá' },
      { note: 'E5', frequency: 659.2551, label: 'Mi' }
    ])
  });

  function analyzePitch(samples, sampleRate) {
    if (!samples || samples.length < 1024 || !Number.isFinite(sampleRate) || sampleRate <= 0) return null;
    const stride = 2;
    const size = Math.floor(samples.length / stride);
    let energy = 0;
    for (let i = 0; i < size; i++) energy += samples[i * stride] ** 2;
    if (Math.sqrt(energy / size) < 0.012) return null;

    const effectiveRate = sampleRate / stride;
    const minLag = Math.max(2, Math.floor(effectiveRate / 1100));
    const maxLag = Math.min(Math.ceil(effectiveRate / 38), Math.floor(size / 2));
    const windowSize = size - maxLag;
    const difference = new Float64Array(maxLag + 1);
    const normalized = new Float64Array(maxLag + 1);
    let cumulative = 0;
    for (let lag = 1; lag <= maxLag; lag++) {
      let sum = 0;
      for (let i = 0; i < windowSize; i++) {
        const delta = samples[i * stride] - samples[(i + lag) * stride];
        sum += delta * delta;
      }
      difference[lag] = sum;
      cumulative += sum;
      normalized[lag] = cumulative ? (sum * lag) / cumulative : 1;
    }
    let bestLag = -1;
    for (let lag = minLag; lag < maxLag; lag++) {
      if (normalized[lag] < 0.18) {
        while (lag + 1 < maxLag && normalized[lag + 1] < normalized[lag]) lag++;
        bestLag = lag;
        break;
      }
    }
    if (bestLag < 0) return null;
    const left = normalized[bestLag - 1], center = normalized[bestLag], right = normalized[bestLag + 1];
    const denominator = left - 2 * center + right;
    const offset = denominator ? Math.max(-1, Math.min(1, (left - right) / (2 * denominator))) : 0;
    const frequency = effectiveRate / (bestLag + offset);
    return frequency >= 38 && frequency <= 1100 ? frequency : null;
  }

  function noteForFrequency(frequency, targetFrequency) {
    if (!Number.isFinite(frequency) || frequency <= 0) return null;
    const midi = Math.round(69 + 12 * Math.log2(frequency / 440));
    const nearestFrequency = 440 * 2 ** ((midi - 69) / 12);
    const reference = Number.isFinite(targetFrequency) && targetFrequency > 0 ? targetFrequency : nearestFrequency;
    return {
      name: NOTE_NAMES[((midi % 12) + 12) % 12],
      octave: Math.floor(midi / 12) - 1,
      frequency,
      cents: 1200 * Math.log2(frequency / reference),
      nearestCents: 1200 * Math.log2(frequency / nearestFrequency)
    };
  }

  function create(options = {}) {
    let stream = null;
    let audioContext = null;
    let source = null;
    let analyser = null;
    let frameId = 0;
    let generation = 0;
    let lastAnalysis = 0;
    let previousFrequency = null;

    function stop() {
      generation++;
      if (frameId) global.cancelAnimationFrame(frameId);
      frameId = 0;
      if (source) source.disconnect();
      if (analyser) analyser.disconnect();
      if (stream) stream.getTracks().forEach(track => track.stop());
      if (audioContext) audioContext.close().catch(() => {});
      stream = audioContext = source = analyser = null;
      previousFrequency = null;
    }

    async function start(onSample) {
      stop();
      const ownGeneration = generation;
      const devices = options.mediaDevices || global.navigator?.mediaDevices;
      const AudioContextClass = options.AudioContext || global.AudioContext || global.webkitAudioContext;
      if (!devices?.getUserMedia || !AudioContextClass) throw new Error('microphone_unavailable');
      const pendingStream = await devices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }, video: false });
      if (ownGeneration !== generation) { pendingStream.getTracks().forEach(track => track.stop()); return false; }
      try {
        stream = pendingStream;
        audioContext = new AudioContextClass();
        await audioContext.resume();
        if (ownGeneration !== generation) { stop(); return false; }
        source = audioContext.createMediaStreamSource(stream);
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 8192;
        analyser.smoothingTimeConstant = 0;
        source.connect(analyser); // Sem conexão à saída: o microfone não produz eco.
        const samples = new Float32Array(analyser.fftSize);
        const tick = timestamp => {
          if (ownGeneration !== generation || !analyser) return;
          frameId = global.requestAnimationFrame(tick);
          if (timestamp - lastAnalysis < 80) return;
          lastAnalysis = timestamp;
          analyser.getFloatTimeDomainData(samples);
          const measured = analyzePitch(samples, audioContext.sampleRate);
          if (!measured) { previousFrequency = null; onSample(null); return; }
          // Suaviza a oscilação visual sem ocultar mudanças de nota.
          const frequency = previousFrequency && Math.abs(1200 * Math.log2(measured / previousFrequency)) < 65
            ? previousFrequency * 0.6 + measured * 0.4 : measured;
          previousFrequency = frequency;
          onSample(frequency);
        };
        frameId = global.requestAnimationFrame(tick);
        return true;
      } catch (error) {
        stop();
        throw error;
      }
    }

    return Object.freeze({ start, stop, isRunning: () => Boolean(stream) });
  }

  global.appTuner = Object.freeze({ create, analyzePitch, noteForFrequency, strings: GUITAR_STRINGS, instruments: INSTRUMENTS });
})(window);
