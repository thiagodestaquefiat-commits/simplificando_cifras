// "B9.   E/G#" no meio da cifra é linha de acordes (o ponto colado veio do site de origem).
// Antes virava letra e aparecia na página Letra como "notas perdidas".
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const src=fs.readFileSync('js/editor/song-format.js','utf8');
const parse=t=>{const m=/^([A-G](#|b)?)(m|maj7|7|9|sus4|sus2|add9|º|°|dim|aug|\+)*(\d+)?(\/[A-Ga-g](#|b)?)?$/i.exec(t);return m?{root:m[1]}:null;};
const ctx={console,multiInstrumentChordLibrary:{parseChord:parse}};ctx.window=ctx;vm.runInNewContext(src,ctx);const f=ctx.songFormat;
assert.equal(f.chordLine('        B9.                    E/G#'),true,'acorde com ponto + outro acorde = linha de cifra');
assert.equal(f.chordLine('B9 E/G#'),true);
assert.equal(f.chordLine('A. E.'),false,'só acordes com ponto continuam texto');
assert.equal(f.chordLine('Que nunca, nunca será tirada'),false);
assert.equal(f.chordLine('E disse'),false);
assert.equal(f.cleanSheetLine('C#F#G#'),'C# F# G#','acordes grudados são separados');
assert.equal(f.chordLine('C#F#G#'),true,'intro com acordes grudados é linha de cifra');
assert.equal(f.cleanSheetLine('EBA'),'EBA','palavra sem sustenido/bemol/número continua igual');
assert.equal(f.cleanSheetLine('Deus é bom'),'Deus é bom');
const html=fs.readFileSync('index.html','utf8');
assert.ok(html.includes("song-lyrics-verse\">${eventEsc(line.replace(/\\s{2,}/g,' ').trim())}"),'página Letra junta os espaços de alinhamento');
console.log('ok - acorde com ponto no fim não vira letra');
