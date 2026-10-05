// Resumo harmônico no padrão ROUDY: só acordes e frases-gancho, sem nomes de seção —
// inclusive em músicas já salvas (nada é alterado no que está gravado).
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const context = { window: null, console };
context.window = context;
vm.runInNewContext(fs.readFileSync("js/instruments/instrument-definitions.js", "utf8"), context);
vm.runInNewContext(fs.readFileSync("js/instruments/multi-instrument-chord-library.js", "utf8"), context);
vm.runInNewContext(fs.readFileSync("js/editor/song-format.js", "utf8"), context);
const format = context.songFormat;

// Música salva com nomes de seção (formato do editor, como Isaías 9).
const saved = { id: "s1", title: "Isaías 9", artist: "Rodolfo Abrantes", key: "D", editorData: { originalKey: "D", sections: [
  { label: "Intro", lines: [{ lyrics: "", repeticoes: 2, chords: [{ chord: "C", position: 0 }, { chord: "G4", position: 3 }, { chord: "Am", position: 7 }] }] },
  { label: "Primeira Parte", lines: [{ lyrics: "Um menino nasceu", chords: [{ chord: "C", position: 0 }, { chord: "G4", position: 3 }, { chord: "Am", position: 7 }] }] },
  { label: "Pré-Refrão", lines: [{ lyrics: "", chords: [{ chord: "F7M", position: 0 }, { chord: "Am", position: 5 }] }] }
] } };
const summary = format.harmonicSummary(saved);
assert.deepEqual(summary.sections.map((section) => section.showLabel), [false, false, false], "nomes de seção escondidos");
const text = format.simpleText(format.fromLegacy(saved));
assert.doesNotMatch(text, /Intro|Primeira Parte|Pré-Refrão/, "editor sem nomes de seção");
assert.match(text, /Um menino nasceu/);
assert.match(text, /C\s+G4\s+Am\s+\(2x\)/);

// Biblioteca base: o rótulo é a própria frase-gancho e continua aparecendo.
const base = { id: 7, title: "Altar", key: "C", blocos: [{ l: "Deus me chamou", c: "C  G  F" }, { l: "Refrão", c: "C  G  Am" }] };
const baseSummary = format.harmonicSummary(base);
const shown = baseSummary.sections.map((section) => section.showLabel ? section.label : section.lines[0].lyrics || "");
assert.ok(shown.some((value) => /Deus me chamou/.test(value)), "frase-gancho da biblioteca base continua");
assert.ok(!baseSummary.sections.some((section) => section.showLabel && /Refrão/.test(section.label)), "Refrão escondido");
["Intro", "Primeira Parte", "Segunda Parte", "Pré-Refrão", "Refrão 2", "[Ponte]", "Solo", "Final", "Chorus"].forEach((name) => assert.ok(format.isSectionName(name), name));
["Deus me chamou", "A alegria", "Ao Rei", "Santo, Santo"].forEach((hook) => assert.ok(!format.isSectionName(hook), hook));
console.log("summary-without-section-names.test.js: OK (sem nomes de seção no resumo, editor e músicas salvas; ganchos mantidos)");
