const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8'),values=new Map(),context={currentDetailId:'song',appCurrentUser:{id:'owner'},storage:{get:(key,fallback)=>values.has(key)?values.get(key):fallback}};
const functions=['songViewForPage','songPageStorageKey','loadSongPage'].map(name=>html.split(/\r?\n/).find(line=>line.startsWith('function '+name+'('))).join('\n');
vm.createContext(context);vm.runInContext("const SONG_EXTRA_VIEWS=['sheet','tablature'];const SONG_LAST_PAGE=4;"+functions,context);
assert.deepEqual([0,1,2,3,4].map(context.songViewForPage),['full','summary','full','sheet','tablature']);
assert.equal(context.loadSongPage(),0,'sem preferência abre letra+cifra');
const legacy='sc_song_content_view_v1:owner:song',current=context.songPageStorageKey();
for(const [old,next] of [[0,1],[1,0],[2,2],[3,3],[4,4]]){values.set(legacy,old);assert.equal(context.loadSongPage(),next,'preferência antiga preserva conteúdo');}
values.set(current,1);assert.equal(context.loadSongPage(),1,'preferência nova tem prioridade');
assert(html.includes('[combinedHtml,summaryHtml,lyricsHtml,'));
assert(html.includes("const SONG_PAGE_LABELS=['Letra e cifra','Resumo harmônico','Letra']"));
console.log('song-view-order: OK (ordem, partitura e compatibilidade das preferências)');
