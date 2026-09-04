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
assert.deepEqual(JSON.parse(JSON.stringify(saved.accessContext)), { scope: "personal", ownerId: null, teamId: null });

const teamModel = context.songFormat.fromLegacy({
  ...legacy,
  accessContext: { scope: "team", ownerId: "user-1", teamId: "team-7" }
});
const teamSaved = context.songFormat.toLegacy(teamModel, legacy);
assert.deepEqual(JSON.parse(JSON.stringify(teamSaved.accessContext)), { scope: "team", ownerId: "user-1", teamId: "team-7" });
assert.deepEqual(JSON.parse(JSON.stringify(teamSaved.editorData.accessContext)), JSON.parse(JSON.stringify(teamSaved.accessContext)));
assert.deepEqual(JSON.parse(JSON.stringify(context.songFormat.harmonicSummary(teamSaved).accessContext)), JSON.parse(JSON.stringify(teamSaved.accessContext)));

const repeated = context.songFormat.normalize({
  title: "Resumo IA", source: "ai",
  sections: [{ label: "Trecho", lines: [{ lyrics: "Frase curta", repeticoes: 7, chords: [
    { chord: "D", position: 0 }, { chord: "C", position: 3 }, { chord: "D", position: 6 }
  ] }] }]
});
assert.equal(repeated.sections[0].lines[0].repeticoes, 7);
const repeatedLegacy = context.songFormat.toLegacy(repeated);
assert.match(repeatedLegacy.blocos[0].c, /D\s+C\s+D\s+\(7x\)/);
assert.equal(repeatedLegacy.editorData.sections[0].lines[0].repeticoes, 7);

const simple = context.songFormat.simpleText(context.songFormat.normalize({
  title: "Cultura do Céu", originalKey: "C", source: "ai",
  sections: [
    { type: "intro", label: "Intro", lines: [{ lyrics: "", repeticoes: null, chords: [{ chord: "F", position: 0 }, { chord: "Am", position: 3 }, { chord: "G", position: 7 }] }] },
    { type: "custom", label: "Trecho 2", lines: [{ lyrics: "Aqui na terra como no céu", repeticoes: 3, chords: [{ chord: "F", position: 0 }, { chord: "Am", position: 3 }, { chord: "G", position: 7 }] }] },
    { type: "outro", label: "Final", lines: [{ lyrics: "", repeticoes: null, chords: [{ chord: "Am", position: 0 }, { chord: "G", position: 4 }, { chord: "Em", position: 7 }] }] }
  ]
}));
assert.match(simple, /^Intro\nF\s+Am\s+G/m);
assert.match(simple, /Aqui na terra como no céu\nF\s+Am\s+G\s+\(3x\)/);
assert.match(simple, /Final\nAm\s+G\s+Em$/);
const simpleSections = context.songFormat.sectionsFromSimpleText(simple.replace("Aqui na terra", "Aqui nesta terra"), repeated);
assert.equal(simpleSections[0].label, "Intro");
assert.equal(simpleSections[1].lines[0].lyrics, "Aqui nesta terra como no céu");
assert.equal(simpleSections[1].lines[0].repeticoes, 3);
assert.deepEqual(JSON.parse(JSON.stringify(simpleSections[1].lines[0].chords.map((item) => item.chord))), ["F", "Am", "G"]);

const legacySummary = context.songFormat.harmonicSummary({
  id: "legacy", title: "Manual", artist: "Equipe", key: "A", capo: "Capotraste casa 2",
  blocos: [{ l: "Refrão", c: "A E F#m D  (3x)\nFrase manual" }]
});
assert.equal(legacySummary.currentKey, "A");
assert.equal(legacySummary.capo, 2);
assert.equal(legacySummary.sections[0].lines[0].repeticoes, 3);
assert.deepEqual(JSON.parse(JSON.stringify(legacySummary.sections[0].lines[0].chords.map((item) => item.chord))), ["A", "E", "F#m", "D"]);
assert.equal(legacySummary.sections[0].lines[0].lyrics, "Frase manual");

const structuredSummary = context.songFormat.harmonicSummary({
  ...repeatedLegacy,
  blocos: [{ l: "Versão legada conflitante", c: "A B C" }]
});
assert.equal(structuredSummary.sections[0].label, "Trecho");
assert.equal(structuredSummary.sections[0].lines[0].repeticoes, 7);
assert.deepEqual(JSON.parse(JSON.stringify(structuredSummary.sections[0].lines[0].chords.map((item) => item.chord))), ["D", "C", "D"]);

for (const instrument of context.instrumentDefinitions.all) {
  assert.equal(context.songEditorValidation.chord("A9", instrument.id).valid, true, instrument.id);
  assert.equal(context.songEditorValidation.chord("D/F#", instrument.id).valid, true, instrument.id);
}

console.log("song-editor.test.js: OK (formato, histórico, transposição, segurança e 5 instrumentos)");
