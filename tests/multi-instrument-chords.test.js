const assert = require("node:assert/strict");

global.window = {};
require("../js/instruments/instrument-definitions.js");
require("../js/instruments/multi-instrument-chord-library.js");

const definitions = window.instrumentDefinitions;
const library = window.multiInstrumentChordLibrary;
const mandatory = [
  "C", "Cm", "C5", "C6", "Cm6", "C7", "C7M", "Cm7", "C9", "Cmaj9", "Cm9",
  "Cadd9", "C11", "Cm11", "C13", "Csus2", "Csus4", "Cdim", "Cm7(b5)", "Caug",
  "C/E", "A9", "A4", "Asus4", "B4", "Bsus4", "C#m7", "F#m7(11)", "D/F#",
  "E/G#", "G/B", "Am/C", "Bb7M", "C#9", "Gadd9"
];

assert.equal(definitions.defaultId, "guitar");
assert.equal(definitions.all.length, 5);
assert.equal(definitions.get("violao").id, "guitar");
assert.equal(definitions.get("guitar").courses, 6);
assert.equal(definitions.get("ukulele").courses, 4);
assert.equal(definitions.get("cavaquinho").courses, 4);
assert.equal(definitions.get("viola-caipira-cebolao-e").courses, 5);
assert.equal(definitions.get("viola-caipira-cebolao-e").physicalStrings, 10);
assert.equal(definitions.get("keyboard").renderer, "keyboard");

for (const instrument of definitions.all) {
  for (const root of library.roots) {
    for (const quality of library.qualities) {
      const chord = root + quality.suffix;
      const result = library.resolve(instrument.id, chord);
      assert.ok(result, `${instrument.id}: ${chord} ausente`);
      assert.equal(result.diagram.instrumentId, instrument.id, `${instrument.id}: cruzamento em ${chord}`);
      assert.deepEqual(library.validateDiagram(result.diagram), [], `${instrument.id}: ${chord}`);
    }
  }
  for (const chord of mandatory) {
    const result = library.resolve(instrument.id, chord);
    assert.ok(result, `${instrument.id}: obrigatório ${chord} ausente`);
    assert.equal(result.displayName, chord, `${instrument.id}: nome visual de ${chord}`);
    assert.deepEqual(library.validateDiagram(result.diagram), [], `${instrument.id}: obrigatório ${chord}`);
  }
  const coverage = library.coverage(instrument.id);
  assert.equal(coverage.canonical, 252);
  assert.equal(coverage.valid, 252);
  assert.equal(coverage.invalid, 0);
  assert.equal(coverage.coverage, 100);
}

const aliasCases = { B4: "Bsus4", A4: "Asus4", C7M: "Cmaj7", "Cm7(b5)": "Cm7b5", "F#m7(11)": "F#m11", "Bb7M": "A#maj7" };
for (const [shown, canonical] of Object.entries(aliasCases)) {
  for (const instrument of definitions.all) {
    const result = library.resolve(instrument.id, shown);
    assert.equal(result.canonicalName, canonical, `${instrument.id}: alias ${shown}`);
    assert.equal(result.displayName, shown, `${instrument.id}: exibição ${shown}`);
  }
}

for (const alias of Object.keys(library.aliases).filter((value) => !["#5"].includes(value))) {
  for (const instrument of definitions.all) {
    const result = library.resolve(instrument.id, `C${alias}`);
    assert.ok(result, `${instrument.id}: alias declarado C${alias} ausente`);
    assert.equal(result.displayName, `C${alias}`);
  }
}

for (const instrument of definitions.all) {
  for (const chord of ["A9", "B4", "E", "C#m7", "F#m7(11)", "Em", "Bm", "G", "D", "A"]) {
    assert.ok(library.resolve(instrument.id, chord), `${instrument.id}: repertório obrigatório ${chord}`);
  }
}

const keyboardInversion = library.resolve("keyboard", "C/E").diagram;
assert.equal(keyboardInversion.notes[0], "E");
assert.equal(keyboardInversion.renderer, "keyboard");
assert.equal("frets" in keyboardInversion, false);

console.log("multi-instrument-chords.test.js: OK (5 instrumentos, 252 canônicos por instrumento, cobertura 100%)");
