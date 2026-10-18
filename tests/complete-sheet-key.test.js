// Completar cifra: a Letra + Cifras encontrada fica no mesmo tom/forma do resumo da música.
// Uso: node tests/complete-sheet-key.test.js
const fs=require('fs'),vm=require('vm');
const html=fs.readFileSync(require('path').join(__dirname,'..','index.html'),'utf8').split('\n');
const grab=(start,endRe)=>{const i=html.findIndex(l=>l.startsWith(start));let j=i;while(!endRe.test(html[j]))j++;return html.slice(i,j+1).join('\n');};
const ctx={window:{}};ctx.global=ctx.window;vm.createContext(ctx);
for(const f of ['js/song-model.js','js/chord-library.js','js/instruments/instrument-definitions.js','js/instruments/multi-instrument-chord-library.js','js/chord-utils.js','js/editor/chord-simplifier.js','js/editor/song-format.js'].map(f=>require('path').join(__dirname,'..',f)))vm.runInContext(fs.readFileSync(f,"utf8"),ctx);
const code=[grab('const SHARP',/^const SHARP/),grab('const FLAT',/^const FLAT/),grab('const ALL_CHORDS',/\];/),grab('function noteIdx',/^function noteIdx/),grab('function shiftNote',/^}/),grab('function shiftToken',/^}/),grab('function shiftText',/^}/),grab('function transposeEventChordText',/^}/),grab('function completeSheetKeyShift',/^}/)].join('\n');
vm.runInContext('var songFormat=window.songFormat;'+code,ctx);
const a=require('assert/strict');const k=(s,d)=>ctx.completeSheetKeyShift(s,d);
a.equal(k({key:'D'},{tom:'G'}),7);                       // G -> D
a.equal(k({key:'D',capo:'2'},{tom:'E',capotraste:4}),0); // mesma forma C (teste existente)
a.equal(k({key:'D'},{tom:null}),0);                       // sem tom na fonte: não mexe
a.equal(k({},{tom:'G'}),0);                               // sem tom na música: não mexe
a.equal(k({key:'Bb'},{tom:'C'}),10);
const sheet='[Intro]\nG  C  D  Em\n\n[Verso]\nG        D/F#\nSenhor eu sei\nEm7      C9\nDa tua graça';
const out=ctx.transposeEventChordText(sheet,k({key:'D'},{tom:'G'}));

a.match(out,/^D  G  A  Bm$/m);a.match(out,/Senhor eu sei/);a.match(out,/Da tua graça/);a.match(out,/A\/C#/);
console.log('complete-sheet-key.test.js: OK');
