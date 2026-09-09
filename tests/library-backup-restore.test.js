const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const memory=new Map();
const context={window:null,console,structuredClone,Blob,Date,setTimeout,clearTimeout,URL:{createObjectURL:()=>'',revokeObjectURL(){}},document:{body:{appendChild(){}},createElement:()=>({click(){},remove(){}})},storage:{snapshotRaw:()=>Object.fromEntries(memory)}};
context.window=context;
for(const file of ['js/song-model.js','js/export-library.js','js/import-library.js'])vm.runInNewContext(fs.readFileSync(file,'utf8'),context,{filename:file});

function richSong(index){
 const base=context.songModel.create({
  id:`backup-${index}`,title:`Música ${index}`,artist:'Artista',key:'C#m',capo:'2',
  blocos:[{l:'Refrão',c:'C#m B2 A9',t:'Frase-gancho',repeticoes:3,progressao:['C#m','B2','A9'],futureBlock:{kept:true}}],
  editorData:{sections:[{type:'chorus',lines:[{lyrics:'Frase-gancho',chords:[{chord:'C#m',position:0}]}]}]},
  fullChordSheet:{visibility:'private',source:'user_upload',content:'C#m  B2  A9\nFrase-gancho',futureSheet:'preservado',sections:[{nome:'Refrão',futureSection:7,linhas:[{letra:'Frase-gancho',futureLine:true,acordes:[{acorde:'C#m',posicao:0,futureChord:'ok'}]}]}]},
  harmonicSummary:{key:'C#m',blocks:[{section:'Refrão',chords:['C#m','B2','A9'],hook:'Frase-gancho',repetitions:3}]},
  spotifyTrackId:`spotify-${index}`,spotifyUri:`spotify:track:${index}`,youtubeVideoId:`youtube-${index}`,album:'Álbum',coverUrl:'https://example.test/capa.png',isrc:'brabc1234567',duration:123000,
  futureTopLevel:{version:99,kept:true}
 },{now:'2026-09-09T00:00:00.000Z'});
 return {...base,librarySync:{clientId:`client-${index}`,serverVersion:index,syncedAt:'2026-09-09T00:00:00.000Z',contentHash:`hash-${index}`}};
}

const original=Array.from({length:138},(_,index)=>richSong(index+1));
memory.set('sc_songs_v1',JSON.stringify(original));memory.set('cifras_musicas_v1',JSON.stringify(original));memory.set('unknown_future_key','raw-preserved');
const payload=context.libraryExporter.buildExport({catalogoPadrao:[],musicas:original,events:[],playlists:[],medleys:[],favoritos:[],configuracoes:{}});
assert.deepEqual(payload.origens.sessaoAtual.musicas,original,'exportação preserva o Song completo');
assert.equal(payload.origens.armazenamentoUsuario.armazenamentoBruto.unknown_future_key,'raw-preserved');

const emptyPlan=context.libraryImporter.plan(payload,[]);
assert.deepEqual([emptyPlan.total,emptyPlan.current,emptyPlan.newSongs,emptyPlan.existing,emptyPlan.conflicts,emptyPlan.invalid],[138,0,138,0,0,0]);
const restored=context.libraryImporter.apply(emptyPlan,[]);
assert.equal(restored.songs.length,138);assert.equal(new Set(restored.songs.map(song=>song.id)).size,138);assert.equal(JSON.stringify(restored.songs),JSON.stringify(original),'restauração mantém integridade integral');
const backupText=JSON.stringify(payload);memory.delete('sc_songs_v1');memory.delete('cifras_musicas_v1');
const storagePlan=context.libraryImporter.parse(backupText,[]),normalizedForStorage=context.songModel.normalizeCollection(context.libraryImporter.apply(storagePlan,[]).songs);
memory.set('sc_songs_v1',JSON.stringify(normalizedForStorage));
assert.equal(JSON.stringify(JSON.parse(memory.get('sc_songs_v1'))),JSON.stringify(original),'exportar → esvaziar storage de teste → restaurar mantém os 138 Songs');
for(const index of [0,68,137]){
 const song=restored.songs[index];assert.ok(song.editorData);assert.ok(song.fullChordSheet);assert.ok(song.harmonicSummary);assert.equal(song.blocos[0].t,'Frase-gancho');assert.equal(song.fullChordSheet.futureSheet,'preservado');assert.equal(song.futureTopLevel.kept,true);
}

const repeated=context.libraryImporter.plan(payload,restored.songs);
assert.deepEqual([repeated.newSongs,repeated.existing,repeated.conflicts],[0,138,0],'segunda restauração é idempotente');
const changed=structuredClone(restored.songs);changed[0].key='D';
const conflict=context.libraryImporter.plan(payload,changed);
assert.deepEqual([conflict.newSongs,conflict.existing,conflict.conflicts],[0,137,1]);
const conflictResult=context.libraryImporter.apply(conflict,changed);assert.equal(conflictResult.songs[0].key,'D','conflito não sobrescreve a cópia local');

const sameNameDifferentId=richSong(999);sameNameDifferentId.title=restored.songs[0].title;sameNameDifferentId.artist=restored.songs[0].artist;
const distinctPayload=structuredClone(payload);distinctPayload.origens.sessaoAtual.musicas=[sameNameDifferentId];
assert.equal(context.libraryImporter.plan(distinctPayload,restored.songs).newSongs,1,'título e artista não definem identidade');

const rawOnly={formato:'simplificando-cifras-exportacao',versao:1,origens:{armazenamentoUsuario:{armazenamentoBruto:{sc_songs_v1:JSON.stringify(original)}}}};
assert.equal(context.libraryImporter.plan(rawOnly,[]).newSongs,138,'snapshot bruto também é restaurável');
assert.throws(()=>context.libraryImporter.parse('{inválido',[]),/JSON válido/);assert.throws(()=>context.libraryImporter.plan({formato:'outro',versao:1},[]),/backup válido/);
console.log('library-backup-restore.test.js: OK (138 Songs, integridade, idempotência, conflitos e fallback bruto)');
