(function (global) {
  "use strict";

  const STORAGE_KEY = "study-metronome-bpm-v1";
  const METER_STORAGE_KEY = "study-metronome-meter-v1";
  const MIN_BPM = 30;
  const MAX_BPM = 240;
  const METERS = Object.freeze({ "2/4": 2, "3/4": 3, "4/4": 4, "6/8": 6 });

  function create(root, storage, onError) {
    const bpmOutput = root.querySelector("#metronome-bpm");
    const playButton = root.querySelector("#metronome-play");
    const meterSelect = root.querySelector("#metronome-meter");
    const beatsContainer = root.querySelector(".metronome-beats");
    const beats = Array.from(root.querySelectorAll(".metronome-beat"));
    let bpm = 72;
    let meter = "4/4";
    let songKey = null;
    let audioContext = null;
    let output = null;
    let timer = null;
    let nextBeatTime = 0;
    let beatIndex = 0;
    let starting = false;
    const visualTimers = new Set();

    function displayBpm() {
      bpmOutput.textContent = String(bpm);
    }

    function displayPlaying(playing) {
      playButton.textContent = playing ? "Ⅱ" : "▶";
      playButton.setAttribute("aria-label", playing ? "Pausar metrônomo" : "Iniciar metrônomo");
      playButton.setAttribute("aria-pressed", String(playing));
      root.classList.toggle("is-playing", playing);
      if (!playing) beats.forEach(beat => beat.classList.remove("is-active"));
    }

    function stop() {
      starting = false;
      if (timer !== null) global.clearInterval(timer);
      timer = null;
      visualTimers.forEach(id => global.clearTimeout(id));
      visualTimers.clear();
      if (output && audioContext) {
        output.gain.cancelScheduledValues(audioContext.currentTime);
        output.gain.setValueAtTime(0, audioContext.currentTime);
        output.disconnect();
      }
      output = null;
      displayPlaying(false);
    }

    function scheduleBeat(time, index) {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.frequency.value = index === 0 ? 1050 : meter === "6/8" && index === 3 ? 900 : 760;
      gain.gain.setValueAtTime(0.0001, time);
      gain.gain.exponentialRampToValueAtTime(index === 0 ? 0.16 : meter === "6/8" && index === 3 ? 0.13 : 0.1, time + 0.003);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.055);
      oscillator.connect(gain);
      gain.connect(output);
      oscillator.start(time);
      oscillator.stop(time + 0.06);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };

      const delay = Math.max(0, (time - audioContext.currentTime) * 1000);
      const id = global.setTimeout(() => {
        visualTimers.delete(id);
        if (timer === null) return;
        beats.forEach((beat, position) => beat.classList.toggle("is-active", position === index));
      }, delay);
      visualTimers.add(id);
    }

    function schedule() {
      while (nextBeatTime < audioContext.currentTime + 0.1) {
        scheduleBeat(nextBeatTime, beatIndex);
        nextBeatTime += 60 / bpm;
        beatIndex = (beatIndex + 1) % METERS[meter];
      }
    }

    async function start() {
      if (timer !== null || starting) return;
      const AudioContextClass = global.AudioContext || global.webkitAudioContext;
      if (!AudioContextClass) {
        onError("O áudio do metrônomo não está disponível neste navegador.");
        return;
      }
      starting = true;
      try {
        audioContext ||= new AudioContextClass();
        await audioContext.resume();
        if (!starting) return;
        output = audioContext.createGain();
        output.connect(audioContext.destination);
        beatIndex = 0;
        nextBeatTime = audioContext.currentTime + 0.03;
        timer = global.setInterval(schedule, 25);
        displayPlaying(true);
        schedule();
      } catch (error) {
        stop();
        onError("Não foi possível iniciar o metrônomo. Toque novamente para tentar.");
      } finally {
        starting = false;
      }
    }

    function setBpm(value) {
      bpm = Math.max(MIN_BPM, Math.min(MAX_BPM, Math.round(value)));
      displayBpm();
      if (songKey !== null) {
        const saved = storage.get(STORAGE_KEY, {});
        storage.set(STORAGE_KEY, { ...saved, [songKey]: bpm });
      }
      if (timer !== null) { stop(); start(); }
    }

    function setMeter(value, persist = true) {
      meter = Object.prototype.hasOwnProperty.call(METERS, value) ? value : "4/4";
      meterSelect.value = meter;
      beatsContainer.setAttribute("aria-label", `${METERS[meter]} tempos do compasso`);
      beats.forEach((beat, index) => { beat.hidden = index >= METERS[meter]; });
      if (persist && songKey !== null) {
        const saved = storage.get(METER_STORAGE_KEY, {});
        storage.set(METER_STORAGE_KEY, { ...saved, [songKey]: meter });
      }
      if (timer !== null) { stop(); start(); }
    }

    function setSong(songId, userId) {
      stop();
      songKey = `${String(userId || "local")}:${String(songId)}`;
      const saved = storage.get(STORAGE_KEY, {});
      const value = Number(saved[songKey]);
      bpm = Number.isFinite(value) && value >= MIN_BPM && value <= MAX_BPM ? value : 72;
      displayBpm();
      setMeter(storage.get(METER_STORAGE_KEY, {})[songKey], false);
    }

    root.querySelector("#metronome-minus").addEventListener("click", () => setBpm(bpm - 1));
    root.querySelector("#metronome-plus").addEventListener("click", () => setBpm(bpm + 1));
    meterSelect.addEventListener("change", () => setMeter(meterSelect.value));
    playButton.addEventListener("click", () => timer === null ? start() : stop());
    displayBpm();
    setMeter("4/4", false);
    displayPlaying(false);
    return Object.freeze({ setSong, stop, getBpm: () => bpm, getMeter: () => meter, isPlaying: () => timer !== null });
  }

  global.studyMetronome = Object.freeze({ create });
})(window);
