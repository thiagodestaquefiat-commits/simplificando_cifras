// Linha de acordes entre parênteses ("( C#m A4 E )") é acorde, não letra:
// não pode aparecer na página Letra e precisa transpor como as outras.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const context = { window: null, console };
context.window = context;
vm.runInNewContext(fs.readFileSync("js/instruments/instrument-definitions.js", "utf8"), context);
vm.runInNewContext(fs.readFileSync("js/instruments/multi-instrument-chord-library.js", "utf8"), context);
vm.runInNewContext(fs.readFileSync("js/editor/song-format.js", "utf8"), context);
const { chordLine } = context.songFormat;

// Acordes com parênteses, colchetes e barras em volta.
for (const line of ["( C#m A4 E )", "(C#m A4 E)", "(C#m  A4  E)", "[ G D Em C ]", "| C | G | Am | F |", "( E )", "C#m A4 E", "(C#m A4 E) (2x)"]) {
  assert.equal(chordLine(line), true, `deveria ser linha de acordes: ${line}`);
}

// Letra continua sendo letra, mesmo com parênteses.
for (const line of ["Precioso Jesus, eu amo o som da Tua voz", "(Eu encontrei o bem mais precioso)", "( )", "()", "Eu encontrei o meu te--souro", "(Ah, Ah)", "E agora"]) {
  assert.equal(chordLine(line), false, `deveria ser letra: ${line}`);
}

console.log("chord-line-brackets.test.js: OK");
