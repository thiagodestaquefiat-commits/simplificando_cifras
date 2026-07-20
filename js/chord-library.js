(function (global) {
  "use strict";

  const TUNING = Object.freeze([4, 9, 2, 7, 11, 4]); // E A D G B E
  const ROOTS = Object.freeze(["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]);
  const REQUESTED_ROOTS = Object.freeze(["A", "A#", "Bb", "B", "C", "C#", "Db", "D", "D#", "Eb", "E", "F", "F#", "Gb", "G", "G#", "Ab"]);
  const FLAT_TO_SHARP = Object.freeze({ Db: "C#", Eb: "D#", Gb: "F#", Ab: "G#", Bb: "A#" });
  const ROOT_INDEX = Object.freeze(Object.fromEntries(ROOTS.map((root, index) => [root, index])));

  const SUFFIX_ALIASES = Object.freeze({
    "": "", maj: "", maior: "",
    m: "m", min: "m", menor: "m", "-": "m",
    5: "5", 6: "6",
    7: "7", dom: "7", dominante: "7",
    M7: "maj7", Maj7: "maj7", MAJ7: "maj7", maj7: "maj7", "7M": "maj7", "7m": "maj7", "7+": "maj7", "Δ7": "maj7",
    m7: "m7", min7: "m7", menor7: "m7", "-7": "m7",
    9: "9", add9: "add9", "(add9)": "add9",
    2: "sus2", sus2: "sus2",
    4: "sus4", sus: "sus4", sus4: "sus4",
    dim: "dim", "°": "dim", o: "dim",
    aug: "aug", "+": "aug", "#5": "aug", "(#5)": "aug",
    11: "11"
  });

  const QUALITIES = Object.freeze([
    { suffix: "", label: "Maior", categories: ["Maiores"], intervals: [0, 4, 7], f: [0, 2, 2, 1, 0, 0], fi: [0, 2, 3, 1, 0, 0] },
    { suffix: "m", label: "Menor", categories: ["Menores"], intervals: [0, 3, 7], f: [0, 2, 2, 0, 0, 0], fi: [0, 2, 3, 0, 0, 0] },
    { suffix: "5", label: "Quinta", categories: ["Quinta"], intervals: [0, 7], f: [0, 2, 2, -1, -1, -1], fi: [0, 2, 3, 0, 0, 0] },
    { suffix: "6", label: "Sexta", categories: ["Sexta"], intervals: [0, 4, 7, 9], f: [0, 2, 2, 1, 2, 0], fi: [0, 2, 3, 1, 4, 0] },
    { suffix: "7", label: "Sétima dominante", categories: ["Sétima", "Dominante"], intervals: [0, 4, 7, 10], f: [0, 2, 0, 1, 0, 0], fi: [0, 2, 0, 1, 0, 0] },
    { suffix: "maj7", label: "Maior 7", categories: ["Maior 7"], intervals: [0, 4, 7, 11], f: [0, 2, 1, 1, 0, 0], fi: [0, 3, 1, 2, 0, 0] },
    { suffix: "m7", label: "Menor 7", categories: ["Menor 7"], intervals: [0, 3, 7, 10], f: [0, 2, 0, 0, 0, 0], fi: [0, 2, 0, 0, 0, 0] },
    { suffix: "9", label: "Nona dominante", categories: ["Nona", "Dominante"], intervals: [0, 2, 4, 7, 10], f: [0, 2, 0, 1, 0, 2], fi: [0, 2, 0, 1, 0, 3] },
    { suffix: "add9", label: "Add9", categories: ["add9"], intervals: [0, 2, 4, 7], f: [0, 2, 2, 1, 0, 2], fi: [0, 2, 3, 1, 0, 4] },
    { suffix: "sus2", label: "Suspenso 2", categories: ["sus2"], intervals: [0, 2, 7], f: [0, 2, 4, 4, 0, 0], fi: [0, 1, 3, 4, 0, 0] },
    { suffix: "sus4", label: "Suspenso 4", categories: ["sus4"], intervals: [0, 5, 7], f: [0, 2, 2, 2, 0, 0], fi: [0, 2, 3, 4, 0, 0] },
    { suffix: "dim", label: "Diminuto", categories: ["Diminutos"], intervals: [0, 3, 6, 9], f: [0, 1, 2, 0, 2, 0], fi: [0, 1, 2, 0, 3, 0] },
    { suffix: "aug", label: "Aumentado", categories: ["Aumentados"], intervals: [0, 4, 8], f: [0, 3, 2, 1, 1, 0], fi: [0, 4, 3, 1, 2, 0] },
    { suffix: "11", label: "Décima primeira", categories: ["Décima primeira"], intervals: [0, 2, 4, 5, 7, 10], f: [0, 0, 0, 1, 0, 2], fi: [0, 0, 0, 1, 0, 2] }
  ]);

  const QUALITY_BY_SUFFIX = Object.freeze(Object.fromEntries(QUALITIES.map((quality) => [quality.suffix, quality])));
  const diagrams = Object.create(null);

  function modulo(value, divisor) {
    return ((value % divisor) + divisor) % divisor;
  }

  function canonicalRoot(value) {
    if (!value) return "";
    const match = String(value).replace(/♯/g, "#").replace(/♭/g, "b").match(/^([A-Ga-g])([#b]?)$/);
    if (!match) return "";
    const formatted = match[1].toUpperCase() + match[2];
    return FLAT_TO_SHARP[formatted] || formatted;
  }

  function displayRoot(value) {
    const match = String(value || "").replace(/♯/g, "#").replace(/♭/g, "b").match(/^([A-Ga-g])([#b]?)$/);
    return match ? match[1].toUpperCase() + match[2] : "";
  }

  function normalizeSuffix(value) {
    const suffix = String(value || "").trim();
    if (Object.prototype.hasOwnProperty.call(SUFFIX_ALIASES, suffix)) return SUFFIX_ALIASES[suffix];
    const caseInsensitive = Object.keys(SUFFIX_ALIASES).find((key) => key.toLowerCase() === suffix.toLowerCase());
    return caseInsensitive === undefined ? null : SUFFIX_ALIASES[caseInsensitive];
  }

  function parseChord(value) {
    const compact = String(value || "").trim().replace(/♯/g, "#").replace(/♭/g, "b").replace(/\s+/g, "");
    const match = compact.match(/^([A-Ga-g][#b]?)([^/]*)(?:\/([A-Ga-g][#b]?))?$/);
    if (!match) return null;
    const shownRoot = displayRoot(match[1]);
    const root = canonicalRoot(match[1]);
    const suffix = normalizeSuffix(match[2]);
    const shownBass = match[3] ? displayRoot(match[3]) : "";
    const bass = match[3] ? canonicalRoot(match[3]) : "";
    if (!root || suffix === null || (match[3] && !bass)) return null;
    const displayName = shownRoot + match[2] + (shownBass ? "/" + shownBass : "");
    const canonicalName = root + suffix + (bass && bass !== root ? "/" + bass : "");
    return { input: value, displayName, shownRoot, shownBass, root, suffix, bass, canonicalName };
  }

  function shiftedFingers(template, shift) {
    if (!shift) return template.fi.slice();
    return template.f.map((fret) => {
      if (fret < 0) return 0;
      if (fret === 0) return 1;
      return Math.min(4, fret + 1);
    });
  }

  function buildBaseDiagram(root, quality) {
    const shift = modulo(ROOT_INDEX[root] - ROOT_INDEX.E, 12);
    const frets = quality.f.map((fret) => fret < 0 ? -1 : fret + shift);
    const rootStrings = quality.f.map((fret, index) => fret === 0 ? index : -1).filter((index) => index >= 0);
    const bar = shift > 0 && rootStrings.length > 1
      ? { fr: shift, s: Math.min(...rootStrings), e: Math.max(...rootStrings) }
      : null;
    return {
      f: frets,
      fi: shiftedFingers(quality, shift),
      b: shift > 0 ? shift : 1,
      ...(bar ? { bar } : {}),
      strings: 6,
      root,
      bass: root,
      suffix: quality.suffix,
      quality: quality.label,
      categories: quality.categories.slice(),
      intervals: quality.intervals.slice(),
      source: "biblioteca"
    };
  }

  function absolutePitch(stringIndex, fret) {
    return [40, 45, 50, 55, 59, 64][stringIndex] + fret;
  }

  function visualSpan(frets) {
    const positive = frets.filter((fret) => fret > 0);
    if (!positive.length) return 0;
    const base = frets.includes(0) ? 1 : Math.min(...positive);
    return Math.max(...positive) - base;
  }

  function slashFingers(frets) {
    const positiveFrets = [...new Set(frets.filter((fret) => fret > 0))].sort((a, b) => a - b);
    const fingerByFret = new Map(positiveFrets.map((fret, index) => [fret, Math.min(4, index + 1)]));
    return frets.map((fret) => fret > 0 ? fingerByFret.get(fret) : 0);
  }

  const slashTemplateCache = new Map();

  function findSlashTemplate(quality, bassInterval) {
    const cacheKey = `${quality.suffix}:${bassInterval}`;
    if (slashTemplateCache.has(cacheKey)) return slashTemplateCache.get(cacheKey);
    const chordPitchClasses = new Set(quality.intervals.map((interval) => modulo(ROOT_INDEX.E + interval, 12)));
    const requiredIntervals = quality.intervals.filter((interval) => !(interval === 7 && quality.intervals.length >= 5));
    const desiredBass = modulo(ROOT_INDEX.E + bassInterval, 12);
    const candidates = [];

    for (let bassString = 0; bassString <= 3; bassString += 1) {
      for (let bassFret = 0; bassFret <= 12; bassFret += 1) {
        if (modulo(TUNING[bassString] + bassFret, 12) !== desiredBass) continue;
        const bassAbsolute = absolutePitch(bassString, bassFret);
        const frets = Array(6).fill(-1);
        frets[bassString] = bassFret;

        function visit(stringIndex) {
          if (stringIndex === 6) {
            if (visualSpan(frets) > 4) return;
            const played = frets.filter((fret) => fret >= 0).length;
            if (played < Math.min(3, requiredIntervals.length + 1)) return;
            const present = new Set();
            frets.forEach((fret, index) => {
              if (fret < 0) return;
              present.add(modulo(TUNING[index] + fret - ROOT_INDEX.E, 12));
            });
            if (requiredIntervals.some((interval) => !present.has(interval))) return;
            const positive = frets.filter((fret) => fret > 0);
            const maxFret = positive.length ? Math.max(...positive) : 0;
            const muted = frets.filter((fret) => fret < 0).length;
            candidates.push({
              frets: frets.slice(),
              bassString,
              score: visualSpan(frets) * 1000 + maxFret * 10 + muted * 20 + frets.filter((fret) => fret > 0).reduce((sum, fret) => sum + fret, 0)
            });
            return;
          }
          if (stringIndex <= bassString) return visit(stringIndex + 1);
          const options = [-1];
          for (let fret = 0; fret <= 12; fret += 1) {
            const pitchClass = modulo(TUNING[stringIndex] + fret, 12);
            if (chordPitchClasses.has(pitchClass) && absolutePitch(stringIndex, fret) >= bassAbsolute) options.push(fret);
          }
          for (const fret of options) {
            frets[stringIndex] = fret;
            if (visualSpan(frets) <= 4) visit(stringIndex + 1);
          }
          frets[stringIndex] = -1;
        }

        visit(bassString + 1);
      }
    }
    candidates.sort((left, right) => left.score - right.score);
    if (!candidates[0]) throw new Error(`Sem digitação para E${quality.suffix}/${ROOTS[modulo(ROOT_INDEX.E + bassInterval, 12)]}`);
    slashTemplateCache.set(cacheKey, candidates[0]);
    return candidates[0];
  }

  function buildSlashDiagram(baseDiagram, bass) {
    const quality = QUALITY_BY_SUFFIX[baseDiagram.suffix];
    const rootShift = modulo(ROOT_INDEX[baseDiagram.root] - ROOT_INDEX.E, 12);
    const bassInterval = modulo(ROOT_INDEX[bass] - ROOT_INDEX[baseDiagram.root], 12);
    const template = findSlashTemplate(quality, bassInterval);
    const selected = {
      bassString: template.bassString,
      frets: template.frets.map((fret) => fret < 0 ? -1 : fret + rootShift)
    };
    const positive = selected.frets.filter((fret) => fret > 0);
    return {
      ...baseDiagram,
      f: selected.frets,
      fi: slashFingers(selected.frets),
      b: selected.frets.includes(0) ? 1 : Math.min(...positive),
      bass,
      bassString: selected.bassString,
      categories: [...new Set([...baseDiagram.categories, "Inversões", "Acordes com baixo"])],
      source: "biblioteca-baixo",
      bar: undefined
    };
  }

  for (const root of ROOTS) {
    for (const quality of QUALITIES) {
      const baseName = root + quality.suffix;
      const baseDiagram = buildBaseDiagram(root, quality);
      diagrams[baseName] = Object.freeze(baseDiagram);
      for (const bass of ROOTS) {
        if (bass === root) continue;
        diagrams[`${baseName}/${bass}`] = Object.freeze(buildSlashDiagram(baseDiagram, bass));
      }
    }
  }

  function resolve(value) {
    const parsed = parseChord(value);
    if (!parsed) return null;
    const diagram = diagrams[parsed.canonicalName];
    return diagram ? { ...parsed, diagram } : null;
  }

  function validateDiagram(name, diagram) {
    const errors = [];
    if (!diagram || !Array.isArray(diagram.f) || diagram.f.length !== 6) errors.push("cordas");
    if (!diagram || !Array.isArray(diagram.fi) || diagram.fi.length !== 6) errors.push("dedos");
    if (diagram && diagram.f && diagram.f.some((fret) => !Number.isInteger(fret) || fret < -1 || fret > 24)) errors.push("casas");
    if (diagram && diagram.fi && diagram.fi.some((finger) => !Number.isInteger(finger) || finger < 0 || finger > 4)) errors.push("dedos inválidos");
    if (diagram && diagram.f && diagram.fi && diagram.f.some((fret, index) => fret <= 0 && diagram.fi[index] !== 0)) errors.push("dedo em corda solta/muda");
    if (diagram && (!Number.isInteger(diagram.b) || diagram.b < 1 || diagram.b > 24)) errors.push("casa base");
    if (diagram && visualSpan(diagram.f) > 4) errors.push("amplitude");
    if (diagram && diagram.bar) {
      const { fr, s, e } = diagram.bar;
      if (!Number.isInteger(fr) || fr < 1 || fr > 24 || !Number.isInteger(s) || !Number.isInteger(e) || s < 0 || e > 5 || s >= e) errors.push("pestana");
    }
    if (diagram && diagram.f) {
      const rootIndex = ROOT_INDEX[diagram.root];
      const allowed = new Set(diagram.intervals.map((interval) => modulo(rootIndex + interval, 12)));
      const firstPlayed = diagram.f.findIndex((fret) => fret >= 0);
      diagram.f.forEach((fret, stringIndex) => {
        if (fret < 0) return;
        const pitchClass = modulo(TUNING[stringIndex] + fret, 12);
        if (stringIndex === firstPlayed && diagram.bass !== diagram.root) {
          if (pitchClass !== ROOT_INDEX[diagram.bass]) errors.push("baixo");
        } else if (!allowed.has(pitchClass)) errors.push("nota fora do acorde");
      });
      const present = new Set(diagram.f.map((fret, stringIndex) => fret < 0 ? null : modulo(TUNING[stringIndex] + fret - rootIndex, 12)).filter((value) => value !== null));
      for (const interval of diagram.intervals) {
        if (!present.has(interval) && interval !== 7) errors.push(`intervalo ${interval}`);
      }
    }
    return [...new Set(errors.map((error) => `${name}: ${error}`))];
  }

  const categories = Object.freeze([...new Set(QUALITIES.flatMap((quality) => quality.categories).concat(["Inversões", "Acordes com baixo"]))]);
  const frozenDiagrams = Object.freeze(diagrams);

  global.chordLibrary = Object.freeze({
    roots: ROOTS,
    requestedRoots: REQUESTED_ROOTS,
    categories,
    qualities: QUALITIES,
    aliases: Object.freeze({ roots: FLAT_TO_SHARP, suffixes: SUFFIX_ALIASES }),
    diagrams: frozenDiagrams,
    count: Object.keys(frozenDiagrams).length,
    canonicalRoot,
    normalizeSuffix,
    parseChord,
    resolve,
    validateDiagram
  });
})(window);
