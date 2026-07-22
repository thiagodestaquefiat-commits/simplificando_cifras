const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const context = { console, Date, Math, JSON, Map, Set, Object, Array, String, Number, Boolean, RegExp };
context.window = context;
vm.createContext(context);
[
  "js/instruments/instrument-definitions.js",
  "js/instruments/multi-instrument-chord-library.js",
  "js/editor/song-format.js",
  "js/editor/song-editor-history.js",
  "js/editor/song-editor-validation.js",
  "js/editor/chord-simplifier.js",
  "js/editor/song-editor-state.js"
].forEach((file) => vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file }));

const legacy = {
  id: 45, title: "Liberta-me de mim", artist: "", key: "E", capo: "", instrumento: "guitar",
  blocos: [{ l: "Verso", c: "A9  B4  E  C#m7\nPois o bem\nA9  B4  E  F#m7(11)" }]
};
const model = context.songFormat.fromLegacy(legacy);
assert.equal(model.id, 45);
assert.equal(model.originalKey, "E");
assert.equal(model.currentKey, "E");
assert.equal(model.sections.length, 1);
assert.ok(model.sections[0].lines.some((line) => line.chords.some((item) => item.chord === "F#m7(11)")));

const state = context.songEditorState.create(model);
state.updateMeta("title", "Título revisado");
state.addSection("chorus");
assert.equal(state.get().sections.length, 2);
const chorusId = state.get().sections[1].id;
state.duplicateSection(chorusId);
assert.equal(state.get().sections.length, 3);
state.moveSection(chorusId, -1);
state.removeSection(chorusId);
assert.equal(state.get().sections.length, 2);
state.undo();
assert.equal(state.get().sections.length, 3);
state.redo();
assert.equal(state.get().sections.length, 2);

const inversion = context.songEditorState.transposeChord("D/F#", 2);
assert.equal(inversion, "E/G#");
assert.equal(context.songEditorState.transposeChord("F#m7(11)", 2), "G#m7(11)");
assert.equal(context.songEditorState.transposeChord("C#m7", 2), "D#m7");
state.transposeSong("F#");
assert.equal(state.get().currentKey, "F#");
state.restoreOriginal();
assert.equal(state.get().currentKey, "E");

assert.equal(context.chordSimplifier.suggest("F#m7(11)"), "F#m7");
assert.equal(context.chordSimplifier.suggest("C7M"), "C");
assert.equal(context.chordSimplifier.suggest("Dsus4"), "D");
assert.equal(context.chordSimplifier.suggest("G/B"), "G");
assert.equal(context.songEditorValidation.chord("H7", "guitar").valid, false);
assert.equal(context.songEditorValidation.chord("A9", "guitar").valid, true);

const safe = context.songFormat.normalize({ title: "<img src=x onerror=alert(1)>", artist: "<script>x</script>", sections: [{ label: "<b>Verso</b>", lines: [{ lyrics: "<svg onload=x>", chords: [{ chord: "G", position: 0 }] }] }] });
assert.doesNotMatch(safe.title + safe.artist + safe.sections[0].label + safe.sections[0].lines[0].lyrics, /[<>]/);

const saved = context.songFormat.toLegacy(model, legacy);
assert.equal(saved.id, 45);
assert.equal(saved.songFormatVersion, 3);
assert.ok(Array.isArray(saved.blocos));
assert.ok(Array.isArray(saved.editorData.sections));
assert.equal(saved.key, "E");

for (const instrument of context.instrumentDefinitions.all) {
  assert.equal(context.songEditorValidation.chord("A9", instrument.id).valid, true, instrument.id);
  assert.equal(context.songEditorValidation.chord("D/F#", instrument.id).valid, true, instrument.id);
}

console.log("song-editor.test.js: OK (formato, histórico, transposição, segurança e 5 instrumentos)");
