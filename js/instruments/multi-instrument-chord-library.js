(function (global) {
  "use strict";

  const ROOTS = Object.freeze(["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]);
  const FLATS = Object.freeze({ Db: "C#", Eb: "D#", Gb: "F#", Ab: "G#", Bb: "A#" });
  const NOTE_NAMES = Object.freeze(["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]);
  const QUALITY_LIST = Object.freeze([
    { suffix: "", label: "Maior", intervals: [0, 4, 7], required: [0, 4, 7] },
    { suffix: "m", label: "Menor", intervals: [0, 3, 7], required: [0, 3, 7] },
    { suffix: "5", label: "Quinta", intervals: [0, 7], required: [0, 7] },
    { suffix: "6", label: "Sexta", intervals: [0, 4, 7, 9], required: [0, 4, 9, 7] },
    { suffix: "m6", label: "Menor sexta", intervals: [0, 3, 7, 9], required: [0, 3, 9, 7] },
    { suffix: "7", label: "Sétima dominante", intervals: [0, 4, 7, 10], required: [0, 4, 10, 7] },
    { suffix: "maj7", label: "Sétima maior", intervals: [0, 4, 7, 11], required: [0, 4, 11, 7] },
    { suffix: "m7", label: "Menor com sétima", intervals: [0, 3, 7, 10], required: [0, 3, 10, 7] },
    { suffix: "mMaj7", label: "Menor com sétima maior", intervals: [0, 3, 7, 11], required: [0, 3, 11, 7] },
    { suffix: "9", label: "Nona dominante", intervals: [0, 2, 4, 7, 10], required: [0, 4, 10, 2] },
    { suffix: "maj9", label: "Maior com nona", intervals: [0, 2, 4, 7, 11], required: [0, 4, 11, 2] },
    { suffix: "m9", label: "Menor com nona", intervals: [0, 2, 3, 7, 10], required: [0, 3, 10, 2] },
    { suffix: "add9", label: "Add9", intervals: [0, 2, 4, 7], required: [0, 4, 2, 7] },
    { suffix: "11", label: "Décima primeira", intervals: [0, 2, 4, 5, 7, 10], required: [0, 4, 10, 5] },
    { suffix: "m11", label: "Menor com décima primeira", intervals: [0, 2, 3, 5, 7, 10], required: [0, 3, 10, 5] },
    { suffix: "13", label: "Décima terceira", intervals: [0, 2, 4, 7, 9, 10], required: [0, 4, 10, 9] },
    { suffix: "sus2", label: "Suspenso 2", intervals: [0, 2, 7], required: [0, 2, 7] },
    { suffix: "sus4", label: "Suspenso 4", intervals: [0, 5, 7], required: [0, 5, 7] },
    { suffix: "dim", label: "Diminuto", intervals: [0, 3, 6, 9], required: [0, 3, 6, 9] },
    { suffix: "m7b5", label: "Meio-diminuto", intervals: [0, 3, 6, 10], required: [0, 3, 6, 10] },
    { suffix: "aug", label: "Aumentado", intervals: [0, 4, 8], required: [0, 4, 8] }
  ]);
  const QUALITY_BY_SUFFIX = Object.freeze(Object.fromEntries(QUALITY_LIST.map((quality) => [quality.suffix, quality])));
  const ALIASES = Object.freeze({
    "": "", maj: "", maior: "",
    m: "m", min: "m", menor: "m", "-": "m",
    5: "5", 6: "6", m6: "m6", 7: "7", dom: "7",
    maj7: "maj7", M7: "maj7", "7M": "maj7", "7m": "maj7", "7+": "maj7", "Δ7": "maj7",
    m7: "m7", min7: "m7", mMaj7: "mMaj7", "m(maj7)": "mMaj7",
    9: "9", maj9: "maj9", M9: "maj9", m9: "m9", add9: "add9", "(add9)": "add9",
    11: "11", m11: "m11", "m7(11)": "m11", 13: "13",
    2: "sus2", sus2: "sus2", 4: "sus4", sus: "sus4", sus4: "sus4",
    dim: "dim", "°": "dim", o: "dim",
    "m7(b5)": "m7b5", "m7b5": "m7b5", "ø": "m7b5",
    aug: "aug", "+": "aug", "#5": "aug", "(#5)": "aug"
  });
  const cache = new Map();

  function mod(value, divisor = 12) { return ((value % divisor) + divisor) % divisor; }
  function canonicalRoot(value) {
    const match = String(value || "").replace(/♯/g, "#").replace(/♭/g, "b").match(/^([A-Ga-g])([#b]?)$/);
    if (!match) return "";
    const root = match[1].toUpperCase() + match[2];
    return FLATS[root] || root;
  }
  function normalizeSuffix(value) {
    const suffix = String(value || "").trim();
    if (Object.prototype.hasOwnProperty.call(ALIASES, suffix)) return ALIASES[suffix];
    const alias = Object.keys(ALIASES).find((key) => key.toLowerCase() === suffix.toLowerCase());
    return alias === undefined ? null : ALIASES[alias];
  }
  function parseChord(value) {
    const compact = String(value || "").trim().replace(/♯/g, "#").replace(/♭/g, "b").replace(/\s+/g, "");
    const match = compact.match(/^([A-Ga-g][#b]?)(.*?)(?:\/([A-Ga-g][#b]?))?$/);
    if (!match) return null;
    const root = canonicalRoot(match[1]);
    const suffix = normalizeSuffix(match[2]);
    const bass = match[3] ? canonicalRoot(match[3]) : root;
    if (!root || suffix === null || !bass) return null;
    return { input: value, displayName: compact, root, suffix, bass, isInversion: Boolean(match[3]), canonicalName: root + suffix + (bass !== root ? "/" + bass : "") };
  }
  function pitchName(midi) { return NOTE_NAMES[mod(midi)]; }
  function visualSpan(frets) {
    const positive = frets.filter((fret) => fret > 0);
    return positive.length < 2 ? 0 : Math.max(...positive) - Math.min(...positive);
  }
  function fingerData(frets) {
    const positive = [...new Set(frets.filter((fret) => fret > 0))].sort((a, b) => a - b);
    const fingerByFret = new Map(positive.map((fret, index) => [fret, Math.min(4, index + 1)]));
    const fingers = frets.map((fret) => fret > 0 ? fingerByFret.get(fret) : 0);
    const barres = [];
    for (const fret of positive) {
      const indexes = frets.map((value, index) => value === fret ? index : -1).filter((index) => index >= 0);
      if (indexes.length >= 2 && Math.max(...indexes) - Math.min(...indexes) + 1 === indexes.length) {
        barres.push({ fret, start: Math.min(...indexes), end: Math.max(...indexes), finger: fingerByFret.get(fret) });
      }
    }
    return { fingers, barres };
  }
  function requiredIntervals(quality, capacity, bassInterval) {
    const bassConsumesSlot = !quality.required.slice(0, capacity).includes(bassInterval);
    const limit = Math.max(2, capacity - (bassConsumesSlot ? 1 : 0));
    return quality.required.slice(0, limit);
  }
  function makeKeyboardDiagram(instrument, parsed, quality) {
    const rootPc = ROOTS.indexOf(parsed.root);
    const bassPc = ROOTS.indexOf(parsed.bass);
    const ordered = quality.intervals.map((interval) => mod(rootPc + interval));
    if (!ordered.includes(bassPc)) ordered.unshift(bassPc);
    const fromBass = [bassPc, ...ordered.filter((pitch) => pitch !== bassPc)];
    const midiNotes = fromBass.map((pitch, index) => {
      let midi = 48 + pitch;
      if (index === 0) while (midi > 55) midi -= 12;
      else while (midi <= 48 + bassPc) midi += 12;
      return midi;
    });
    return Object.freeze({
      instrumentId: instrument.id, renderer: "keyboard", canonicalChord: parsed.canonicalName,
      displayName: parsed.displayName, tuning: instrument.tuningLabel, root: parsed.root, bass: parsed.bass,
      suffix: parsed.suffix, intervals: quality.intervals.slice(), requiredIntervals: quality.required.slice(),
      notes: fromBass.map((pitch) => NOTE_NAMES[pitch]), midiNotes, producedNotes: fromBass.map((pitch) => NOTE_NAMES[pitch]),
      difficulty: 1, variant: "posição compacta", validationStatus: "valid"
    });
  }
  function solveFretted(instrument, parsed, quality) {
    const rootPc = ROOTS.indexOf(parsed.root);
    const bassPc = ROOTS.indexOf(parsed.bass);
    const bassInterval = mod(bassPc - rootPc);
    const required = requiredIntervals(quality, instrument.courses, bassInterval);
    const allowed = new Set(quality.intervals.map((interval) => mod(rootPc + interval)));
    allowed.add(bassPc);
    const options = instrument.tuning.map((openMidi) => {
      const values = [-1];
      for (let fret = 0; fret <= 12; fret += 1) if (allowed.has(mod(openMidi + fret))) values.push(fret);
      return values;
    });
    let best = null;
    const frets = Array(instrument.courses).fill(-1);
    function visit(index) {
      if (index === instrument.courses) {
        const played = frets.map((fret, string) => fret < 0 ? null : instrument.tuning[string] + fret).filter((note) => note !== null);
        if (played.length < Math.min(3, instrument.courses)) return;
        const lowest = Math.min(...played);
        if (parsed.isInversion && mod(lowest) !== bassPc) return;
        const intervals = new Set(played.map((note) => mod(note - rootPc)));
        if (required.some((interval) => !intervals.has(interval))) return;
        const span = visualSpan(frets);
        if (span > 7) return;
        const uniqueFrets = new Set(frets.filter((fret) => fret > 0));
        if (uniqueFrets.size > 4) return;
        const maxFret = Math.max(0, ...frets);
        const muted = frets.filter((fret) => fret < 0).length;
        const opens = frets.filter((fret) => fret === 0).length;
        const score = span * 100 + maxFret * 8 + muted * 22 + uniqueFrets.size * 5 - opens * 4;
        if (!best || score < best.score) best = { score, frets: frets.slice(), played };
        return;
      }
      for (const fret of options[index]) {
        frets[index] = fret;
        if (visualSpan(frets) <= 7) visit(index + 1);
      }
      frets[index] = -1;
    }
    visit(0);
    if (!best) return null;
    const positive = best.frets.filter((fret) => fret > 0);
    const { fingers, barres } = fingerData(best.frets);
    return Object.freeze({
      instrumentId: instrument.id, renderer: instrument.renderer, canonicalChord: parsed.canonicalName,
      displayName: parsed.displayName, tuning: instrument.tuningLabel, strings: instrument.physicalStrings,
      courses: instrument.courses, frets: best.frets, f: best.frets, fingers, fi: fingers,
      barres, ...(barres[0] ? { bar: { fr: barres[0].fret, s: barres[0].start, e: barres[0].end } } : {}),
      baseFret: positive.length ? Math.max(1, Math.min(...positive)) : 1,
      b: positive.length ? Math.max(1, Math.min(...positive)) : 1,
      root: parsed.root, bass: parsed.bass, suffix: parsed.suffix,
      intervals: quality.intervals.slice(), requiredIntervals: required,
      producedNotes: best.played.map(pitchName), difficulty: Math.min(5, 1 + Math.floor(best.score / 100)),
      variant: "posição padrão validada", validationStatus: "valid"
    });
  }
  function resolve(instrumentId, chordName) {
    const instrument = global.instrumentDefinitions.get(instrumentId);
    const parsed = parseChord(chordName);
    if (!instrument || !parsed) return null;
    const quality = QUALITY_BY_SUFFIX[parsed.suffix];
    if (!quality) return null;
    const key = instrument.id + ":" + parsed.canonicalName;
    if (!cache.has(key)) cache.set(key, instrument.renderer === "keyboard" ? makeKeyboardDiagram(instrument, parsed, quality) : solveFretted(instrument, parsed, quality));
    const diagram = cache.get(key);
    return diagram ? { ...parsed, instrument, diagram } : null;
  }
  function validateDiagram(diagram) {
    const errors = [];
    if (!diagram) return ["diagrama ausente"];
    const instrument = global.instrumentDefinitions.get(diagram.instrumentId);
    if (!instrument || instrument.id !== diagram.instrumentId) errors.push("instrumento");
    if (diagram.renderer !== instrument.renderer) errors.push("renderer");
    if (instrument.renderer === "keyboard") {
      if (!Array.isArray(diagram.notes) || diagram.notes.length < 2) errors.push("teclas");
      if (diagram.notes[0] !== diagram.bass) errors.push("baixo");
      return errors;
    }
    if (diagram.courses !== instrument.courses || diagram.frets.length !== instrument.courses) errors.push("cordas/ordens");
    if (diagram.frets.some((fret) => !Number.isInteger(fret) || fret < -1 || fret > 12)) errors.push("casas");
    if (diagram.fingers.some((finger) => !Number.isInteger(finger) || finger < 0 || finger > 4)) errors.push("dedos");
    if (visualSpan(diagram.frets) > 7) errors.push("abertura");
    const played = diagram.frets.map((fret, index) => fret < 0 ? null : instrument.tuning[index] + fret).filter((note) => note !== null);
    if (!played.length || (diagram.canonicalChord.includes("/") && pitchName(Math.min(...played)) !== diagram.bass)) errors.push("baixo");
    const rootPc = ROOTS.indexOf(diagram.root);
    const present = new Set(played.map((note) => mod(note - rootPc)));
    if (diagram.requiredIntervals.some((interval) => !present.has(interval))) errors.push("intervalos");
    const allowed = new Set(diagram.intervals.concat([mod(ROOTS.indexOf(diagram.bass) - rootPc)]));
    if ([...present].some((interval) => !allowed.has(interval))) errors.push("nota incompatível");
    for (const barre of diagram.barres) if (barre.start < 0 || barre.end >= instrument.courses || barre.start >= barre.end || barre.fret < 1) errors.push("pestana");
    return [...new Set(errors)];
  }
  function logicalCount() { return ROOTS.length * QUALITY_LIST.length * ROOTS.length; }

  global.multiInstrumentChordLibrary = Object.freeze({
    roots: ROOTS, qualities: QUALITY_LIST, aliases: ALIASES,
    canonicalCountPerInstrument: ROOTS.length * QUALITY_LIST.length,
    logicalCountPerInstrument: logicalCount(), parseChord, resolve, validateDiagram,
    coverage(instrumentId) {
      let valid = 0, invalid = 0;
      for (const root of ROOTS) for (const quality of QUALITY_LIST) {
        const result = resolve(instrumentId, root + quality.suffix);
        if (result && validateDiagram(result.diagram).length === 0) valid += 1; else invalid += 1;
      }
      return { instrumentId: global.instrumentDefinitions.normalizeId(instrumentId), canonical: ROOTS.length * QUALITY_LIST.length, valid, invalid, missing: invalid, coverage: valid / (valid + invalid) * 100 };
    }
  });
})(window);
