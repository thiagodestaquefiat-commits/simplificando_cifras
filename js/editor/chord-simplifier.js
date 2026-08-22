(function (global) {
  "use strict";
  const suffixes = [
    [/m7\(11\)$/i, "m7"], [/m11$/i, "m7"], [/maj7$/i, ""], [/7M$/i, ""],
    [/sus(?:2|4)$/i, ""], [/[24]$/i, ""], [/add9$/i, ""], [/9$/i, "7"], [/\/([A-G][#b]?)$/i, ""]
  ];
  function suggest(value) {
    const compact = String(value || "").trim();
    for (const [pattern, replacement] of suffixes) {
      const next = compact.replace(pattern, replacement);
      if (next !== compact && global.multiInstrumentChordLibrary.parseChord(next)) return next;
    }
    return null;
  }
  global.chordSimplifier = Object.freeze({ suggest });
})(window);
