// Capotraste no evento é escolha pessoal: abre sem capo (acordes reais), guarda a escolha
// só neste aparelho e não vira versão pessoal nem vai para a banda.
const assert = require("node:assert/strict");
const html = require("fs").readFileSync("index.html", "utf8");
assert.match(html, /selectedCapo=detailEventContext\?\(readEventCapoPref\(detailEventContext\)\?\?0\):\(saved\.capo\?\?capoNum\)/, "no evento abre com a escolha da pessoa ou sem capo");
assert.match(html, /if\(detailEventContext\)writeEventCapoPref\(detailEventContext,selectedCapo\);/, "trocar o capo guarda a escolha da pessoa");
assert.match(html, /const toneChanged=Number\(state\.semitones\)!==Number\(detailEditBaseline\.semitones\);/, "capo não cria versão pessoal");
assert.match(html, /eventSongCopy\(\{\.\.\.song,\.\.\.state\.video\},\{\.\.\.state,capo:storedCapo\}\)/, "capo não é gravado na cópia do evento");
assert.match(html, /totalShift=currentSemitones\+storedCapo-selectedCapo/, "acordes reais = forma do texto + capo do texto - capo escolhido");
console.log("event-capo-personal-source.test.js: OK");
