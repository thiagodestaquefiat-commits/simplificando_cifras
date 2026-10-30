// "Organizar resumos" precisa achar laço escondido numa linha e a mesma parte escrita duas vezes
// (caso real "Ainda que a figueira", 30/10/2026); "Teu Amor Não Falha" já estava no padrão.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const context = { console, Date, Math, JSON, Object, Array, String, Number, Boolean, RegExp, Error };
context.window = context;
vm.createContext(context);
["js/instruments/instrument-definitions.js", "js/instruments/multi-instrument-chord-library.js", "js/editor/song-format.js", "js/summary-organizer.js"]
  .forEach((file) => vm.runInContext(fs.readFileSync(file, "utf8"), context, { filename: file }));
const { summaryOrganizer } = context;

const song = (title, lines) => ({ id: title, title, editorData: { sections: lines.map(([chords, repeticoes, lyrics]) => ({
  type: "custom", label: "", hideLabel: true,
  lines: [{ lyrics: lyrics || "", repeticoes, chords: chords.split(" ").map((chord, index) => ({ chord, position: index * 5 })) }]
})) } });

const figueira = song("Ainda que a figueira", [
  ["F#m E9 Bm7 D", 2, "Tu és a minha porção"], ["A E9 Bm7 D", 2, "Mesmo que meus pais me deixem"],
  ["A E9 Bm7 D A E9 G D", null, "Ainda que a figueira"], ["Bm7 A E9 Bm7 A E9 Bm7 A E9 Bm7 A E9 D", null, ""],
  ["A E9 Bm7 D A E9 G D A E9 Bm7", null, "Ainda que a figueira"], ["D A E9 G D A", null, "Não dê o seu fruto"]
]);
const teuAmor = song("Teu Amor Não Falha", [
  ["Am F C G", 2, ""], ["Am F C G", 2, "Nada vai me separar"], ["F C G Dm", 2, "Tu és o mesmo pra sempre"],
  ["F C G", null, "Porque eu sei que me amas"], ["F Am G", null, "Teu amor não falha"]
]);
const soLaco = song("Só laço", [["G D Em C", null, "Primeira frase"], ["Bm7 A E9 Bm7 A E9 Bm7 A E9 D", null, ""]]);
const soRepetida = song("Só repetida", [["G D", null, "Mesma frase"], ["C D", null, "Outra"], ["G D Em", null, "Mesma frase"]]);
const modulada = song("Modulada", [["G D Em C", null, "Teu amor não falha"], ["A E F#m D", null, "Teu amor não falha"]]);

assert.equal(summaryOrganizer.offStandard(figueira), true, "figueira precisa ser organizada");
assert.equal(summaryOrganizer.offStandard(teuAmor), false, "Teu Amor Não Falha já está certo");
assert.equal(summaryOrganizer.offStandard(soLaco), true, "laço escondido numa linha, mesmo sem Letra + Cifras");
assert.equal(summaryOrganizer.offStandard(soRepetida), true, "mesma parte escrita duas vezes");
assert.equal(summaryOrganizer.offStandard(modulada), false, "mesma frase com outros acordes é outra parte");
console.log("summary-organizer-figueira.test.js: OK");
