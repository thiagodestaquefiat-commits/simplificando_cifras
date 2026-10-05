const assert = require("node:assert/strict");
global.window = global;
require("../js/instruments/instrument-definitions.js");
require("../js/instruments/multi-instrument-chord-library.js");
require("../js/editor/song-format.js");
require("../js/editor/song-editor-history.js");
require("../js/editor/song-editor-state.js");

// Notação do Cifra Club: a grafia original é mantida; o equivalente serve só para o diagrama.
const library = window.multiInstrumentChordLibrary;
const cases = {
  "A7(9)": "A9", "E7(4)": "Esus4", "E7(4/9)": "Esus4", "C7(9-)": "C7", "G7(#9)": "G7",
  "C7(13)": "C13", "Cmaj7(9)": "Cmaj9", "C7M(9)": "Cmaj9", "Am7(9)": "Am9", "F#m7(5-)": "F#m7b5",
  "Am13": "Am11", "Am(add9)": "Am", "Am(7M)": "AmMaj7", "C(9)": "Cadd9", "A7(9)/C#": "A9/C#"
};
for (const [chord, diagram] of Object.entries(cases)) {
  const parsed = library.parseChord(chord);
  assert.ok(parsed, chord + " deveria ser aceito");
  assert.equal(parsed.displayName, chord);
  assert.equal(parsed.canonicalName, diagram);
  for (const instrument of window.instrumentDefinitions.all) {
    assert.ok(library.resolve(instrument.id, chord), chord + " sem diagrama em " + instrument.id);
  }
}
for (const invalid of ["Lá", "Sol", "Ré", "C(xyz)", "Cfoo"]) assert.equal(library.parseChord(invalid), null, invalid);

const state = window.songEditorState.create({ title: "t", originalKey: "A", currentKey: "A",
  sections: [{ type: "custom", label: "", lines: [{ lyrics: "x", chords: [{ chord: "A7(9)", position: 0 }, { chord: "E7(4)", position: 6 }] }] }] });
state.transposeSong("B");
const chords = state.get().sections[0].lines[0].chords.map((item) => item.chord);
assert.deepEqual(chords, ["B7(9)", "F#7(4)"]);
console.log("brazilian-chord-notation.test.js: OK");
