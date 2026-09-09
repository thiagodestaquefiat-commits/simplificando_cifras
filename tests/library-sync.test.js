const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('js/library-sync.js','utf8'),html=fs.readFileSync('index.html','utf8'),sw=fs.readFileSync('service-worker.js','utf8');
const remote=new Map(),failOnce=new Set();
function response(body,status=200){return {ok:status>=200&&status<300,status,json:async()=>structuredClone(body)};}
function song(i,extra={}){return {id:`local-${i}`,title:`Música ${i}`,artist:'Artista',key:'C',blocos:[{l:'Refrão',c:'C G',t:'Frase curta',repeticoes:2}],editorData:{sections:[{lines:[]}]},fullChordSheet:{content:'C G\nLetra + Cifras'},harmonicSummary:{blocks:[{chords:['C','G'],hook:'Frase curta'}]},...extra};}
function device(userId,initial,{online=true,consent=false}={}){
 const memory=new Map([['sc_songs_v1',structuredClone(initial)],['cifras_musicas_v1',structuredClone(initial)],['sc_musicas_v2',[{legacy:true}]],['sc_song_editor_drafts_v1',[{draft:true}]],['sc_events_v1',[{id:'event',repertoire:initial.slice(0,3).map(x=>x.id)}]]]);
 if(consent)memory.set('sc_library_sync_consent_v1',true);
 let songs=structuredClone(initial),authUser=userId,authListener,requests=[],batches=[],statusEvents=[];const networkListeners={};
 const storage={get:(k,f)=>memory.has(k)?structuredClone(memory.get(k)):f,set:(k,v)=>{memory.set(k,structuredClone(v));return true;}};
 const navigator={};Object.defineProperty(navigator,'onLine',{get:()=>online});
 async function fetch(_url,options={}){
  if(!online)throw Error('offline');const owner=String(options.headers.Authorization).slice(7),method=options.method||'GET';requests.push(method);
  const values=remote.get(owner)||new Map();remote.set(owner,values);
  if(method==='GET')return response({songs:[...values.values()].filter(item=>!item.deletedAt)});
  const body=JSON.parse(options.body),results=[];batches.push(body.items.length);
  body.items.forEach(item=>{
   const existing=values.get(item.clientId);
   if(failOnce.delete(item.clientId)){results.push({clientId:item.clientId,outcome:'failed',error:'falha_simulada'});return;}
   if(existing&&item.expectedVersion!==existing.version){results.push({clientId:item.clientId,outcome:'failed',error:'conflito_versao'});return;}
   const outcome=existing?JSON.stringify(existing.songData)===JSON.stringify(item.songData)?'existing':'updated':'created';
   const value={id:existing?.id||`server-${owner}-${values.size}`,clientId:item.clientId,songData:structuredClone(item.songData),version:existing?(outcome==='updated'?existing.version+1:existing.version):1,updatedAt:new Date().toISOString(),deletedAt:null};
   values.set(item.clientId,value);results.push({clientId:item.clientId,outcome,song:value});
  });return response({results});
 }
 const context={window:null,console,structuredClone,setTimeout,clearTimeout,crypto:global.crypto,fetch,navigator,
  storage,apiConfig:{libraryEndpoint:p=>'https://api.test/songs'+p},addEventListener:(name,fn)=>{networkListeners[name]=fn;},
  appAuth:{getAccessToken:()=>authUser,subscribe:fn=>{authListener=fn;fn({authenticated:Boolean(authUser),user:authUser?{id:authUser}:null});}}};
 context.window=context;vm.runInNewContext(source,context);
 context.librarySync.initialize({getSongs:()=>songs,setSongs:v=>songs=structuredClone(v),persist:v=>{songs=structuredClone(v);storage.set('sc_songs_v1',v);storage.set('cifras_musicas_v1',v);},render(){}});
 context.librarySync.subscribe(value=>statusEvents.push(structuredClone(value)));
 return {sync:context.librarySync,get songs(){return songs;},replace:v=>{songs=structuredClone(v);storage.set('sc_songs_v1',songs);storage.set('cifras_musicas_v1',songs);},storage,requests,batches,statusEvents,
  setOnline:v=>{online=v;networkListeners[v?'online':'offline']?.();},logout:()=>{authUser='';authListener({authenticated:false,user:null});},login:id=>{authUser=id;authListener({authenticated:true,user:{id}});}};
}
const settle=()=>new Promise(resolve=>setTimeout(resolve,15));
(async()=>{
 remote.clear();
 const five=Array.from({length:5},(_,i)=>song(i));
 const anonymous=device('',five);assert.equal(anonymous.sync.getStatus().phase,'unauthenticated');assert.equal(remote.size,0,'sem login não envia');

 const a=device('user-a',five);await settle();
 let review=await a.sync.review();assert.equal(review.phase,'needs-consent');assert.deepEqual([review.local,review.remote,review.pending,review.conflicts],[5,0,5,0]);assert.equal(remote.get('user-a').size,0,'review não envia');
 const protectedBefore=['sc_musicas_v2','sc_song_editor_drafts_v1'].map(key=>JSON.stringify(a.storage.get(key)));
 const eventsBefore=JSON.stringify(a.storage.get('sc_events_v1'));
 let first=await a.sync.syncNow();assert.deepEqual([first.created,first.failed,first.status.pending],[5,0,0]);assert.equal(first.status.phase,'synced');
 assert.equal(JSON.stringify(a.storage.get('sc_events_v1')),eventsBefore,'evento e ordem ficam intactos');
 assert.deepEqual(['sc_musicas_v2','sc_song_editor_drafts_v1'].map(key=>JSON.stringify(a.storage.get(key))),protectedBefore,'storages legados não são limpos');
 const repeated=await a.sync.syncNow();assert.equal(repeated.attempted,0,'sync idempotente não reenvia confirmadas');

 const b=device('user-a',[]);await settle();assert.equal(b.songs.length,5,'nuvem chega ao dispositivo B');assert.equal(b.sync.getStatus().phase,'synced');
 assert.deepEqual(b.songs[0].editorData,five[0].editorData);assert.deepEqual(b.songs[0].fullChordSheet,five[0].fullChordSheet);assert.deepEqual(b.songs[0].harmonicSummary,five[0].harmonicSummary);
 const bEdit=b.songs;bEdit[0]={...bEdit[0],artist:'Editado no B'};b.replace(bEdit);await b.sync.syncNow();await a.sync.pull();assert.equal(a.songs[0].artist,'Editado no B','B → A aplica versão quando A não mudou');

 const preexisting=device('user-a',[song(100),song(101),song(102)]);await settle();assert.equal(preexisting.songs.length,8,'biblioteca existente em B é preservada e combinada');assert.equal(preexisting.sync.getStatus().pending,3);assert.equal(preexisting.sync.getStatus().phase,'needs-consent');

 const editA=a.songs;editA[1]={...editA[1],artist:'Edição concorrente A'};a.replace(editA);
 const editB=b.songs;editB[1]={...editB[1],artist:'Edição concorrente B'};b.replace(editB);await b.sync.syncNow();
 const conflict=await a.sync.pull();assert.equal(conflict.conflicts.length,1);assert.equal(a.songs[1].artist,'Edição concorrente A');assert.equal(a.sync.getStatus().phase,'conflict');
 assert.equal(a.songs[1].librarySync.conflict.remoteSongData.artist,'Edição concorrente B','as duas versões ficam preservadas');

 const offline=device('offline-user',[song(200)],{online:false,consent:true});await settle();assert.equal(offline.sync.getStatus().phase,'offline');
 const offlineSongs=offline.songs;offlineSongs.push(song(201));offline.replace(offlineSongs);offline.sync.schedule();assert.equal(offline.songs.length,2);assert.equal(offline.storage.get('sc_songs_v1').length,2);
 const reopened=device('offline-user',offline.storage.get('sc_songs_v1'),{online:false,consent:true});await settle();assert.equal(reopened.songs.length,2,'fechar e reabrir offline preserva músicas');
 reopened.setOnline(true);await new Promise(resolve=>setTimeout(resolve,1300));assert.equal(remote.get('offline-user').size,2,'criação offline sincroniza ao voltar');
 const offlineB=device('offline-user',[]);await settle();assert.equal(offlineB.songs.length,2);

 const partialSongs=Array.from({length:10},(_,i)=>song(300+i)),partial=device('partial-user',partialSongs);await settle();
 const prepared=partial.sync.prepared(partial.songs);partial.replace(prepared);prepared.slice(5).forEach(item=>failOnce.add(item.librarySync.clientId));
 let partialResult=await partial.sync.syncNow();assert.deepEqual([partialResult.created,partialResult.failed,partialResult.status.pending],[5,5,5]);assert.equal(partialResult.status.phase,'error');
 partialResult=await partial.sync.syncNow();assert.equal(partialResult.attempted,5,'retomada envia somente falhas');assert.equal(partialResult.created,5);assert.equal(remote.get('partial-user').size,10);

 const bulk=Array.from({length:136},(_,i)=>song(500+i)),bulkA=device('bulk-user',bulk);await settle();const bulkResult=await bulkA.sync.syncNow();assert.deepEqual(bulkA.batches.slice(-2),[100,36]);assert.equal(bulkResult.created,136);assert.equal(new Set(bulkA.songs.map(item=>item.librarySync.clientId)).size,136);
 const bulkB=device('bulk-user',[]);await settle();assert.equal(bulkB.songs.length,136);bulkA.logout();assert.equal(bulkA.songs.length,136);bulkA.login('bulk-user');await settle();assert.equal(bulkA.songs.length,136,'logout/login não duplica');

 const outsider=device('user-b',[]);await settle();assert.equal(outsider.songs.length,0,'usuário B não lê músicas A');
 assert.match(html,/Neste dispositivo/);assert.match(html,/Na nuvem/);assert.match(html,/Pendentes/);assert.match(html,/Conflitos/);assert.match(html,/Sincronizar com minha conta/);assert.match(html,/Você está offline/);assert.match(html,/<div class="topbar-title">ROUDY<\/div>/);assert.doesNotMatch(html,/<button[^>]+onclick="exportarBiblioteca\(\)"/);assert.match(html,/<button[^>]+id="library-sync-btn"/);
 assert.match(sw,/simplificando-cifras-v92-integration-39-40/);assert.match(sw,/library-sync\.js\?v=2/);assert.match(sw,/import-library\.js\?v=1/);assert.doesNotMatch(sw,/localStorage\.(?:clear|removeItem)/,'atualização do cache não apaga biblioteca');
 console.log('library-sync.test.js: OK (29 cenários: painel, consentimento, A/B, conflito, parcial, 136 músicas, localStorage, Eventos e PWA)');
})().catch(error=>{console.error(error);process.exitCode=1;});
