(function (global) {
  "use strict";

  const ENHARMONIC_ROOTS = Object.freeze({
    "C#": "Db", Db: "C#", "D#": "Eb", Eb: "D#",
    "F#": "Gb", Gb: "F#", "G#": "Ab", Ab: "G#",
    "A#": "Bb", Bb: "A#"
  });

  function normalizeChordName(value) {
    const compact = String(value || "")
      .trim()
      .replace(/♯/g, "#")
      .replace(/♭/g, "b")
      .replace(/\s+/g, "");
    return compact.split("/").map((part) => {
      const match = part.match(/^([a-gA-G])([#b]?)(.*)$/);
      if (!match) return part;
      return match[1].toUpperCase() + match[2] + match[3];
    }).join("/");
  }

  function splitChord(value) {
    const normalized = normalizeChordName(value);
    const slashIndex = normalized.indexOf("/");
    return {
      displayName: normalized,
      shapeName: slashIndex === -1 ? normalized : normalized.slice(0, slashIndex),
      bassNote: slashIndex === -1 ? "" : normalized.slice(slashIndex + 1)
    };
  }

  function normalizeForLookup(value) {
    const parsed = global.chordLibrary && global.chordLibrary.parseChord(value);
    return parsed ? parsed.canonicalName : normalizeChordName(value);
  }

  function lookupCandidates(value) {
    const { shapeName } = splitChord(normalizeForLookup(value));
    const candidates = [shapeName];
    const rootMatch = shapeName.match(/^([A-G](?:#|b)?)(.*)$/);
    if (rootMatch) {
      const alternateRoot = ENHARMONIC_ROOTS[rootMatch[1]];
      if (alternateRoot) candidates.push(alternateRoot + rootMatch[2]);
    }
    return [...new Set(candidates)];
  }

  function findEquivalent(collection, value) {
    if (!collection) return null;
    for (const candidate of lookupCandidates(value)) {
      if (Object.prototype.hasOwnProperty.call(collection, candidate)) {
        return { key: candidate, value: collection[candidate] };
      }
      const caseInsensitiveKey = Object.keys(collection).find(
        (key) => key.toLocaleLowerCase("pt-BR") === candidate.toLocaleLowerCase("pt-BR")
      );
      if (caseInsensitiveKey) {
        return { key: caseInsensitiveKey, value: collection[caseInsensitiveKey] };
      }
    }
    return null;
  }

  global.chordUtils = Object.freeze({
    normalizeChordName,
    normalizeForLookup,
    splitChord,
    lookupCandidates,
    findEquivalent
  });
})(window);
