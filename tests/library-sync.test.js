const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('js/library-sync.js','utf8'),songModelSource=fs.readFileSync('js/song-model.js','utf8'),html=fs.readFileSync('index.html','utf8'),sw=fs.readFileSync('service-worker.js','utf8');
const remote=new Map(),failOnce=new Set();
function response(body,status=200){return {ok:status>=200&&status<300,status,json:async()=>structuredClone(body)};}
function song(i,extra={}){return {id:`local-${i}`,title:`Música ${i}`,artist:'Artista',key:'C',blocos:[{l:'Refrão',c:'C G',t:'Frase curta',repeticoes:2}],editorData:{sections:[{lines:[]}]},fullChordSheet:{content:'C G\nLetra + Cifras'},harmonicSummary:{blocks:[{chords:['C','G'],hook:'Frase curta'}]},...extra};}
function device(userId,initial,{online=true,consent=false,remoteFormat='camel',migrationCandidate=false,awaitingRemoteOnboarding=false,demos=[]}={}){
 const memory=new Map([['sc_songs_v1',structuredClone(initial)],['cifras_musicas_v1',structuredClone(initial)],['sc_musicas_v2',[{legacy:true}]],['sc_song_editor_drafts_v1',[{draft:true}]],['sc_events_v1',[{id:'event',repertoire:initial.slice(0,3).map(x=>x.id)}]]]);
 if(consent){memory.set('sc_library_sync_consent_v1',true);memory.set('sc_library_sync_consent_by_owner_v1',{[userId]:true});}
 let songs=structuredClone(initial),authUser=userId,authListener,requests=[],batches=[],statusEvents=[],ownerConfirmed=false;const networkListeners={};
 const storage={get:(k,f)=>memory.has(k)?structuredClone(memory.get(k)):f,set:(k,v)=>{memory.set(k,structuredClone(v));return true;}};
 const navigator={};Object.defineProperty(navigator,'onLine',{get:()=>online});
 async function fetch(url,options={}){
  if(!online)throw Error('offline');const owner=String(options.headers.Authorization).slice(7),method=options.method||'GET';requests.push(method);
  const values=remote.get(owner)||new Map();remote.set(owner,values);
  if(method==='GET'){const records=[...values.values()];if(remoteFormat==='snake')return response({songs:records.map(item=>({id:item.id,client_id:item.clientId,song_data:structuredClone(item.songData),version:item.version,updated_at:item.updatedAt,deleted_at:item.deletedAt}))});if(remoteFormat==='records')return response({records:records.map(item=>({id:item.id,client_id:item.clientId,song_data:structuredClone(item.songData),version:item.version,updated_at:item.updatedAt,deleted_at:item.deletedAt}))});if(remoteFormat==='invalid')return response({records:records.map(item=>({id:item.id,clientId:item.clientId,version:item.version}))});return response({songs:records});}
  if(method==='DELETE'){const clientId=decodeURIComponent(url.split('/').pop()),existing=values.get(clientId);if(existing)values.set(clientId,{...existing,version:existing.version+1,updatedAt:new Date().toISOString(),deletedAt:new Date().toISOString()});return response(null,204);}
  const body=JSON.parse(options.body),results=[];batches.push(body.items.length);
  body.items.forEach(item=>{
   const existing=values.get(item.clientId);
   if(failOnce.delete(item.clientId)){results.push({clientId:item.clientId,outcome:'failed',error:'falha_simulada'});return;}
   if(existing&&item.expectedVersion!==existing.version){results.push({clientId:item.clientId,outcome:'failed',error:'conflito_versao'});return;}
   const outcome=existing?JSON.stringify(existing.songData)===JSON.stringify(item.songData)?'existing':'updated':'created';
   const value={id:existing?.id||`server-${owner}-${values.size}`,clientId:item.clientId,songData:structuredClone(item.songData),version:existing?(outcome==='updated'?existing.version+1:existing.version):1,updatedAt:new Date().toISOString(),deletedAt:null};
   values.set(item.clientId,value);results.push({clientId:item.clientId,outcome,song:value});
  });return response({results:remoteFormat==='snake'?results.map(item=>({...item,client_id:item.clientId,clientId:undefined,song:item.song?{id:item.song.id,client_id:item.song.clientId,song_data:item.song.songData,version:item.song.version,updated_at:item.song.updatedAt,deleted_at:item.song.deletedAt}:null})):results});
 }
 const context={window:null,console,structuredClone,setTimeout,clearTimeout,crypto:global.crypto,fetch,navigator,
  demoLibrary:{isDemoSong:value=>String(value?.id||'').startsWith('demo-'),catalog:()=>structuredClone(demos)},
  storage,apiConfig:{libraryEndpoint:p=>'https://api.test/songs'+p},addEventListener:(name,fn)=>{networkListeners[name]=fn;},
  appAuth:{getAccessToken:()=>authUser,subscribe:fn=>{authListener=fn;fn({authenticated:Boolean(authUser),user:authUser?{id:authUser}:null});}}};
 context.window=context;vm.runInNewContext(songModelSource,context);vm.runInNewContext(source,context);
 const markDeleted=(value,confirmed=false)=>{const clientId=String(typeof value==='string'?value:value?.librarySync?.clientId||'');if(!clientId)return false;const all=storage.get('sc_personal_song_deletions_v1',{}),ownerValues=all[userId]||{},existing=ownerValues[clientId];ownerValues[clientId]=existing&&typeof existing==='object'?existing:{deletedAt:new Date().toISOString(),confirmedAt:null};if(confirmed)ownerValues[clientId].confirmedAt=ownerValues[clientId].confirmedAt||new Date().toISOString();storage.set('sc_personal_song_deletions_v1',{...all,[userId]:ownerValues});songs=songs.filter(item=>item.librarySync?.clientId!==clientId);return true;};
 context.librarySync.initialize({getSongs:()=>songs,setSongs:v=>songs=structuredClone(v),persist:v=>{songs=structuredClone(v);storage.set('sc_songs_v1',v);storage.set('cifras_musicas_v1',v);},render(){},activateOwner:()=>({songs:awaitingRemoteOnboarding?[]:structuredClone(songs),migrationCandidate,awaitingRemoteOnboarding}),seedNewOwner:()=>{storage.set('test_demo_medley',[{id:'demo-medley'}]);return structuredClone(demos);},confirmOwner:()=>{ownerConfirmed=true;return true;},markDeleted,confirmDeleted:value=>markDeleted(value,true),getDeletedClientIds:()=>Object.keys(storage.get('sc_personal_song_deletions_v1',{})[userId]||{}),getPendingDeletedClientIds:()=>{const values=storage.get('sc_personal_song_deletions_v1',{})[userId]||{};return Object.keys(values).filter(clientId=>!values[clientId]?.confirmedAt);}});
 context.librarySync.subscribe(value=>statusEvents.push(structuredClone(value)));
 return {sync:context.librarySync,get songs(){return songs;},get ownerConfirmed(){return ownerConfirmed;},replace:v=>{songs=structuredClone(v);storage.set('sc_songs_v1',songs);storage.set('cifras_musicas_v1',songs);},storage,requests,batches,statusEvents,
  setOnline:v=>{online=v;networkListeners[v?'online':'offline']?.();},logout:()=>{authUser='';authListener({authenticated:false,user:null});},login:id=>{authUser=id;authListener({authenticated:true,user:{id}});}};
}
const settle=()=>new Promise(resolve=>setTimeout(resolve,15));
(async()=>{
 remote.clear();
 const five=Array.from({length:5},(_,i)=>song(i));
 const anonymous=device('',five);assert.equal(anonymous.sync.getStatus().phase,'unauthenticated');anonymous.sync.schedule();await settle();assert.equal(anonymous.requests.includes('POST'),false,'sem login não tenta enviar');assert.equal(remote.size,0,'sem login não envia');

 const demos=Array.from({length:4},(_,i)=>song(`demo-${i}`,{id:`demo-${i}`,title:`Demo ${i+1}`}));
 const existing142=Array.from({length:142},(_,i)=>song(`existing-${i}`,{id:`existing-${i}`}));
 remote.set('existing-142',new Map(existing142.map((item,index)=>[`existing-client-${index}`,{id:`server-existing-${index}`,clientId:`existing-client-${index}`,songData:structuredClone(item),version:1,updatedAt:'2026-09-22T00:00:00.000Z',deletedAt:null}])));
 const existingFresh=device('existing-142',demos,{awaitingRemoteOnboarding:true,demos});await settle();
 assert.equal(existingFresh.songs.length,142,'novo dispositivo recupera 86 originais + 56 próprias do backend');
 assert.equal(existingFresh.songs.some(item=>String(item.id).startsWith('demo-')),false,'usuário existente não recebe demos');
 assert.equal(existingFresh.requests.includes('DELETE'),false,'recuperação não altera nenhum registro remoto');

 const newOwner=device('brand-new',demos,{awaitingRemoteOnboarding:true,demos});await settle();
 assert.equal(newOwner.songs.length,4,'usuário novo recebe exatamente quatro demos');
 assert.equal(newOwner.storage.get('test_demo_medley').length,1,'usuário novo recebe exatamente um medley-demo');
 await newOwner.sync.syncNow();
 const previouslyUsedDevice=device('brand-new-used-device',[song('previous-account')],{awaitingRemoteOnboarding:true,demos});await settle();
 assert.equal(previouslyUsedDevice.songs.length,4,'conta nova em dispositivo anteriormente usado recebe quatro demos');
 assert.equal(previouslyUsedDevice.storage.get('test_demo_medley').length,1,'conta nova em dispositivo anteriormente usado recebe um medley-demo');
 const refreshedNewOwner=device('brand-new',demos,{awaitingRemoteOnboarding:true,demos});await settle();
 assert.equal(refreshedNewOwner.songs.length,4,'login/refresh não duplica demos');

 remote.set('existing-empty',new Map([['deleted-song',{id:'server-deleted',clientId:'deleted-song',songData:song('deleted'),version:2,updatedAt:'2026-09-22T00:00:00.000Z',deletedAt:'2026-09-22T01:00:00.000Z'}]]));
 const existingEmpty=device('existing-empty',demos,{awaitingRemoteOnboarding:true,demos});await settle();
 assert.equal(existingEmpty.songs.length,0,'conta existente vazia permanece vazia e não recebe demos novamente');
 assert.equal(existingEmpty.storage.get('test_demo_medley',null),null,'conta existente vazia não recebe medley-demo novamente');

 const existing86=Array.from({length:86},(_,i)=>song(`tester-${i}`,{id:`tester-${i}`}));
 remote.set('existing-tester',new Map(existing86.map((item,index)=>[`tester-client-${index}`,{id:`server-tester-${index}`,clientId:`tester-client-${index}`,songData:structuredClone(item),version:1,updatedAt:'2026-09-22T00:00:00.000Z',deletedAt:null}])));
 const testerFresh=device('existing-tester',[],{awaitingRemoteOnboarding:true,demos});await settle();
 assert.equal(testerFresh.songs.length,86,'conta existente preserva integralmente suas músicas remotas');
 assert.equal(testerFresh.songs.some(item=>String(item.id).startsWith('demo-')),false,'conta existente com músicas não recebe demos');

 const a=device('user-a',five,{consent:true});await settle();
 let review=await a.sync.review();assert.deepEqual([review.local,review.remote,review.pending,review.conflicts],[5,0,5,0]);assert.equal(remote.get('user-a').size,0,'review não envia');
 const protectedBefore=['sc_musicas_v2','sc_song_editor_drafts_v1'].map(key=>JSON.stringify(a.storage.get(key)));
 const eventsBefore=JSON.stringify(a.storage.get('sc_events_v1'));
 let first=await a.sync.syncNow();assert.deepEqual([first.created,first.failed,first.status.pending],[5,0,0]);assert.equal(first.status.phase,'synced');
 assert.equal(JSON.stringify(a.storage.get('sc_events_v1')),eventsBefore,'evento e ordem ficam intactos');
 assert.deepEqual(['sc_musicas_v2','sc_song_editor_drafts_v1'].map(key=>JSON.stringify(a.storage.get(key))),protectedBefore,'storages legados não são limpos');
 const repeated=await a.sync.syncNow();assert.equal(repeated.attempted,0,'sync idempotente não reenvia confirmadas');

 const automatic=device('automatic-owner',[song(6)]);await new Promise(resolve=>setTimeout(resolve,1300));assert.equal(remote.get('automatic-owner').size,1,'usuário autenticado envia pendência sem consentimento manual');

 const migration=device('migration-owner',five,{migrationCandidate:true});await settle();
 assert.equal(remote.get('migration-owner').size,5,'biblioteca legada reservada é copiada silenciosamente');assert.equal(migration.sync.getStatus().phase,'synced');assert.equal(migration.ownerConfirmed,true,'cache só é vinculado ao owner após confirmação final do backend');assert.equal(migration.sync.getStatus().backupReady,true,'a preservação local é registrada sem download');

 const transitionClientIds=Array.from({length:138},(_,index)=>`transition-client-${index}`);
 const transitionLegacy=transitionClientIds.map((clientId,index)=>song(10000+index,{librarySync:{clientId,version:1}}));
 const transition=device('transition-legacy-owner',transitionLegacy,{migrationCandidate:true});const transitionEventsBefore=JSON.stringify(transition.storage.get('sc_events_v1'));await settle();
 assert.deepEqual([transition.songs.length,remote.get('transition-legacy-owner').size,transition.sync.getStatus().pending],[138,138,0],'biblioteca antiga + cloud vazia é preservada e copiada integralmente');
 assert.deepEqual(transition.songs.map(item=>item.librarySync.clientId),transitionClientIds,'a cópia silenciosa preserva todos os clientIds existentes');
 assert.equal(JSON.stringify(transition.storage.get('sc_events_v1')),transitionEventsBefore,'migração de músicas não altera Eventos');

 for(const total of [86,91,106,141]){
  const clientIds=Array.from({length:total},(_,index)=>`seed-${total}-${index}`),library=clientIds.map((clientId,index)=>song(11000+total*10+index,{librarySync:{clientId,version:1}}));
  const current=device(`seed-transition-${total}`,library,{migrationCandidate:true}),eventsBefore=JSON.stringify(current.storage.get('sc_events_v1'));await settle();
  assert.deepEqual([current.songs.length,remote.get(`seed-transition-${total}`).size,current.sync.getStatus().pending],[total,total,0],`${total} músicas locais são copiadas integralmente para a conta`);
  assert.deepEqual(current.songs.map(item=>item.librarySync.clientId),clientIds,`${total} clientIds existentes são preservados`);
  assert.equal(JSON.stringify(current.storage.get('sc_events_v1')),eventsBefore,`Eventos permanecem intactos no cenário ${total}`);
  const second=device(`seed-transition-${total}`,[]);await settle();assert.equal(second.songs.length,total,`segundo dispositivo recupera exatamente ${total}`);
 }

 const partialSeedIds=Array.from({length:96},(_,index)=>`seed-partial-${index}`),partialSeedLibrary=partialSeedIds.map((clientId,index)=>song(14000+index,{librarySync:{clientId,version:1}}));
 const partialCloudA=device('seed-partial-cloud',partialSeedLibrary.slice(0,86),{consent:true});await settle();await partialCloudA.sync.syncNow();
 const partialCloudB=device('seed-partial-cloud',partialSeedLibrary,{migrationCandidate:true});await settle();
 assert.deepEqual([partialCloudB.songs.length,remote.get('seed-partial-cloud').size,partialCloudB.sync.getStatus().pending],[96,96,0],'biblioteca parcialmente sincronizada preserva 86 existentes e copia somente as 10 restantes');
 assert.deepEqual(partialCloudB.songs.map(item=>item.librarySync.clientId),partialSeedIds,'cache/cloud parcial preserva identidades e ordem');

 const b=device('user-a',[]);await settle();assert.equal(b.songs.length,5,'nuvem chega ao dispositivo B');assert.equal(b.sync.getStatus().phase,'synced');assert.equal(b.sync.getStatus().consented,true,'biblioteca existente na conta ativa a sincronização em background no dispositivo B');
 assert.deepEqual(b.songs[0].editorData,five[0].editorData);assert.deepEqual(b.songs[0].fullChordSheet,five[0].fullChordSheet);assert.deepEqual(b.songs[0].harmonicSummary,five[0].harmonicSummary);
 const bEdit=b.songs;bEdit[0]={...bEdit[0],artist:'Editado no B'};b.replace(bEdit);b.sync.schedule();await new Promise(resolve=>setTimeout(resolve,1300));await a.sync.pull();assert.equal(a.songs[0].artist,'Editado no B','B → A sincroniza em background quando A não mudou');

 const preexisting=device('user-a',[song(100),song(101),song(102)],{migrationCandidate:true});await settle();assert.equal(preexisting.songs.length,8,'biblioteca local ainda não associada é preservada e combinada');assert.equal(preexisting.sync.getStatus().pending,0);assert.equal(preexisting.sync.getStatus().phase,'synced');

 const editA=a.songs;editA[1]={...editA[1],artist:'Edição concorrente A'};a.replace(editA);
 const editB=b.songs;editB[1]={...editB[1],artist:'Edição concorrente B'};b.replace(editB);await b.sync.syncNow();
 const conflict=await a.sync.pull();assert.equal(conflict.conflicts.length,1);assert.equal(a.songs[1].artist,'Edição concorrente A');assert.equal(a.sync.getStatus().phase,'conflict');
 assert.equal(a.songs[1].librarySync.conflict.remoteSongData.artist,'Edição concorrente B','as duas versões ficam preservadas');

 const conflictSource=device('partial-conflict-owner',[song(1800)]);await settle();await conflictSource.sync.syncNow();
 const conflictLocal=device('partial-conflict-owner',[]);await settle();
 const conflictRemote=device('partial-conflict-owner',[]);await settle();const remoteEdit=conflictRemote.songs;remoteEdit[0]={...remoteEdit[0],artist:'Versão remota'};conflictRemote.replace(remoteEdit);await conflictRemote.sync.syncNow();
 const localEdit=conflictLocal.songs;localEdit[0]={...localEdit[0],artist:'Versão local'};localEdit.push(song(1801));conflictLocal.replace(localEdit);
 const partialConflictResult=await conflictLocal.sync.syncNow();const conflictClientId=conflictLocal.songs[0].librarySync.clientId;
 assert.equal(partialConflictResult.created,1,'conflito não bloqueia POST da música nova');assert.equal(remote.get('partial-conflict-owner').size,2,'backend recebe a música pendente independente');assert.equal(conflictLocal.songs[0].artist,'Versão local','versão local conflitante não é sobrescrita');assert.equal(conflictLocal.songs[0].librarySync.conflict.remoteSongData.artist,'Versão remota','versão remota conflitante é preservada');assert.equal(remote.get('partial-conflict-owner').get(conflictClientId).songData.artist,'Versão remota','POST não sobrescreve o registro conflitante');

 const newerLocal=a.songs;newerLocal[2]={...newerLocal[2],artist:'Edição local mais nova',updatedAt:'2099-01-01T00:00:00.000Z'};a.replace(newerLocal);
 const newerRemote=b.songs;newerRemote[2]={...newerRemote[2],artist:'Edição remota mais antiga',updatedAt:'2026-01-01T00:00:00.000Z'};b.replace(newerRemote);await b.sync.syncNow();
 await a.sync.syncNow();assert.equal(a.songs[2].artist,'Edição local mais nova','a alteração mais recente vence automaticamente');
 await b.sync.pull();assert.equal(b.songs[2].artist,'Edição remota mais antiga','uma edição em conflito não é sobrescrita automaticamente no outro dispositivo');

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

 const convergenceA=device('convergence-user',Array.from({length:138},(_,i)=>song(1000+i)));await settle();await convergenceA.sync.syncNow();
 const convergenceB=device('convergence-user',[]);await settle();assert.equal(convergenceB.songs.length,138,'B baixa as 138 de A');
 const withThree=convergenceB.songs.concat([song(2001),song(2002),song(2003)]);convergenceB.replace(withThree);await convergenceB.sync.syncNow();
 await convergenceA.sync.pull();assert.equal(convergenceA.songs.length,141,'A recebe as 3 criadas em B');assert.equal(convergenceB.songs.length,141);assert.equal(remote.get('convergence-user').size,141);
 assert.equal((await convergenceB.sync.syncNow()).attempted,0,'B não recria client_id das músicas baixadas');

 const deletionA=device('deletion-user',[song(2100),song(2101)]);await settle();await deletionA.sync.syncNow();
 const deletionB=device('deletion-user',[]);await settle();assert.equal(deletionB.songs.length,2);
 const deletedSong=deletionA.songs[0],deletionEventsBefore=JSON.stringify(deletionA.storage.get('sc_events_v1'));
 assert.equal(deletionA.sync.deleteSong(deletedSong),true);await new Promise(resolve=>setTimeout(resolve,1300));
 assert.equal(deletionA.songs.length,1,'exclusão remove imediatamente do cache da conta');assert.ok(remote.get('deletion-user').get(deletedSong.librarySync.clientId).deletedAt,'DELETE remoto cria tombstone');
 assert.equal(deletionA.requests.filter(method=>method==='DELETE').length,1,'tombstone confirmado não repete DELETE em todo ciclo');
 await deletionB.sync.pull();assert.equal(deletionB.songs.length,1,'segundo dispositivo aplica tombstone e não ressuscita a música');assert.equal(JSON.stringify(deletionA.storage.get('sc_events_v1')),deletionEventsBefore,'excluir da biblioteca não altera repertório do Evento');

 const semanticSource={id:'semantic-x',title:'Mesma música',artist:'Artista',blocos:[{l:'Verso',c:'C G'}],future:{alpha:1,beta:2}};
 const semanticA=device('semantic-user',[semanticSource]);await settle();await semanticA.sync.syncNow();
 const semanticReordered={future:{beta:2,alpha:1},blocos:[{c:'C G',l:'Verso'}],artist:'Artista',title:'Mesma música',id:'semantic-x'};
 const semanticB=device('semantic-user',[semanticReordered]);await settle();assert.equal(semanticB.songs.length,1);assert.equal(semanticB.sync.getStatus().conflicts,0,'ordem das chaves JSON não cria conflito');assert.ok(semanticB.songs[0].librarySync.clientId,'client_id da nuvem é preservado');

 const legacyCloudSongs=Array.from({length:86},(_,i)=>song(3000+i,{createdAt:'2026-09-10T10:00:00.000Z',updatedAt:'2026-09-10T10:00:00.000Z'}));
 const legacyPc=device('legacy-cross-device',legacyCloudSongs);await settle();await legacyPc.sync.syncNow();assert.equal(legacyPc.sync.getStatus().conflicts,0);
 const legacyMobileSongs=legacyCloudSongs.map(item=>({...structuredClone(item),createdAt:'2026-09-10T10:05:00.000Z',updatedAt:'2026-09-10T10:05:00.000Z'}));
 const legacyMobile=device('legacy-cross-device',legacyMobileSongs);await settle();assert.deepEqual([legacyMobile.songs.length,legacyMobile.sync.getStatus().remote,legacyMobile.sync.getStatus().conflicts],[86,86,0],'dois dispositivos adotam as mesmas músicas legacy sem conflito');
 assert.ok(legacyMobile.songs.every(item=>item.librarySync.clientId&&item.librarySync.contentHash),'adoção grava identidade e base semântica estáveis');
 const diagnostic=legacyMobile.sync.diagnostics(),sample=diagnostic.rows[0];assert.equal(sample.status,'synced');assert.equal(sample.reason,'content_equal');assert.equal(sample.localFingerprint,sample.remoteFingerprint);assert.equal(sample.comparisonAtPull.reason,'legacy_adoptable');assert.ok(sample.comparisonAtPull.rawDiff.differences.some(item=>item.path==='createdAt'));assert.equal(sample.comparisonAtPull.semanticDiff.differences.length,0,'diff semântico ignora somente campos voláteis');
 const restarted=device('legacy-cross-device',legacyMobile.storage.get('sc_songs_v1'),{consent:true});await settle();assert.equal(restarted.sync.getStatus().conflicts,0,'reload/PWA restart não recria conflitos');restarted.logout();restarted.login('legacy-cross-device');await settle();assert.equal(restarted.sync.getStatus().conflicts,0,'logout/login não recria conflitos');
 const remoteSample=[...remote.get('legacy-cross-device').values()][0],staleConflict={...structuredClone(remoteSample.songData),createdAt:'2026-09-10T11:00:00.000Z',updatedAt:'2026-09-10T11:00:00.000Z',librarySync:{clientId:remoteSample.clientId,serverVersion:remoteSample.version,contentHash:'old-representation-hash',conflict:{remoteVersion:remoteSample.version}}};
 const recovered=device('legacy-cross-device',[staleConflict]);await settle();assert.equal(recovered.sync.getStatus().conflicts,0,'conflito antigo é limpo quando o conteúdo musical é equivalente');assert.equal(recovered.songs[0].librarySync.conflict,null);
 const joyClientId='auto-resolve-joy',remoteJoy=song('joy',{title:'A alegria',createdAt:'2026-09-16T12:00:00.000Z',updatedAt:'2026-09-16T13:13:14.402Z',currentKey:'C',originalKey:'C',instrumento:'Violão',songFormatVersion:3});
 remote.set('auto-resolve-owner',new Map([[joyClientId,{id:'server-joy',clientId:joyClientId,songData:structuredClone(remoteJoy),version:2,updatedAt:'2026-09-16T13:13:17.000Z',deletedAt:null}]]));
 const localJoy={id:'local-joy',title:'A alegria',artist:'',key:'C',blocos:remoteJoy.blocos,createdAt:'2026-08-21T14:33:04.566Z',updatedAt:'2026-08-21T14:33:04.566Z',librarySync:{clientId:joyClientId,serverVersion:null,contentHash:null,conflict:{remoteVersion:2,remoteSongData:structuredClone(remoteJoy)}}};
 const autoResolver=device('auto-resolve-owner',[localJoy,song('pending-1'),song('pending-2'),song('pending-3')],{consent:true});await settle();
 assert.equal(autoResolver.sync.getStatus().conflicts,1,'conflito preserva as duas versões');assert.ok(autoResolver.sync.getStatus().localPending>=3,'conflito não bloqueia as músicas pendentes independentes');
 await autoResolver.sync.syncNow();assert.equal(remote.get('auto-resolve-owner').size,4,'as músicas pendentes são enviadas depois da resolução automática');
 const autoResolverMobile=device('auto-resolve-owner',[]);await settle();assert.deepEqual([autoResolverMobile.songs.length,autoResolverMobile.sync.getStatus().conflicts],[4,0],'outro dispositivo recebe a biblioteca remota sem conflito local');
 assert.equal(recovered.sync.sameContent({...remoteSample.songData,librarySync:{clientId:'device-a'}},{...remoteSample.songData,librarySync:{clientId:'device-b'}}),true,'librarySync não participa do fingerprint musical');
 assert.equal(recovered.sync.sameContent({id:'defaults',title:'Defaults',duration:'120',blocos:[],editorData:{updatedAt:'device-a'}},{id:'defaults',title:'Defaults',duration:120,album:null,accessContext:{scope:'personal',ownerId:null,teamId:null},sourceInfo:{type:'manual',name:null,url:null},fullChordSheet:null,editorData:{updatedAt:'device-b'}}),true,'defaults, null/ausência, número/string e timestamps do editor convergem');
 assert.doesNotMatch(JSON.stringify(diagnostic),/Bearer|accessToken|refreshToken/i,'diagnóstico não contém tokens');

 const contractSongs=Array.from({length:86},(_,index)=>{const data=song(4000+index,{createdAt:'2026-09-10T12:00:00.000Z',updatedAt:'2026-09-10T12:00:00.000Z'}),clientId=`contract-client-${index}`;return {data,clientId};});
 remote.set('snake-contract-user',new Map(contractSongs.map(({data,clientId},index)=>[clientId,{id:`server-contract-${index}`,clientId,songData:structuredClone(data),version:1,updatedAt:'2026-09-10T12:00:00.000Z',deletedAt:null}])));
 const contractLocal=contractSongs.map(({data,clientId})=>({...structuredClone(data),librarySync:{clientId,serverVersion:1,syncedAt:'2026-09-10T12:00:00.000Z',contentHash:null,conflict:null}}));
 const snakeDevice=device('snake-contract-user',contractLocal,{remoteFormat:'snake'});await settle();const contractDiagnostic=snakeDevice.sync.diagnostics();assert.deepEqual([contractDiagnostic.summary.device,contractDiagnostic.summary.cloud,contractDiagnostic.summary.both,contractDiagnostic.summary.deviceOnly,contractDiagnostic.summary.cloudOnly,contractDiagnostic.summary.conflicts,contractDiagnostic.summary.pendingUpload,contractDiagnostic.summary.pendingDownload],[86,86,86,0,0,0,0,0],'86 clientIds snake_case correspondentes reconciliam como both');assert.deepEqual([contractDiagnostic.remoteContract.source,contractDiagnostic.remoteContract.recordShape.clientId,contractDiagnostic.remoteContract.recordShape.songData],['songs','client_id','song_data']);assert.ok(contractDiagnostic.rows.every(row=>row.localClientId===row.remoteClientId&&row.status==='synced'&&!row.conflict));assert.equal((await snakeDevice.sync.syncNow()).attempted,0,'snake_case equivalente não envia nem gera clientId');
 const recordsDevice=device('snake-contract-user',contractLocal,{remoteFormat:'records'});await settle();assert.deepEqual([recordsDevice.sync.diagnostics().summary.cloud,recordsDevice.sync.diagnostics().summary.both],[86,86],'coleção records com conteúdo também é normalizada');
 const invalidDevice=device('snake-contract-user',contractLocal,{remoteFormat:'invalid'});await settle();assert.equal(invalidDevice.sync.getStatus().phase,'error','contrato incompleto falha fechado');assert.equal(invalidDevice.sync.getStatus().localPending,0,'contrato inválido não transforma 86 remotos em uploads');
 const emptyOwner=device('empty-owner',contractLocal,{consent:true});await settle();assert.deepEqual([emptyOwner.sync.getStatus().phase,emptyOwner.sync.getStatus().remote,emptyOwner.sync.getStatus().localPending,emptyOwner.sync.getStatus().conflicts,emptyOwner.sync.getStatus().identityBlocked],['error',0,0,0,true],'owner remoto vazio bloqueia e limpa métricas antigas');const emptyDiagnostic=emptyOwner.sync.diagnostics();assert.deepEqual([emptyDiagnostic.summary.blockedIdentity,emptyDiagnostic.summary.pendingUpload],[86,0]);await assert.rejects(()=>emptyOwner.sync.syncNow(),/envio foi bloqueado/);assert.equal(emptyOwner.requests.includes('POST'),false,'fail-safe não envia músicas para owner não confirmado');assert.deepEqual(emptyOwner.songs.map(item=>item.librarySync.clientId),contractLocal.map(item=>item.librarySync.clientId),'fail-safe não gera nem troca clientIds');

 const outsider=device('user-b',[]);await settle();assert.equal(outsider.songs.length,0,'usuário B não lê músicas A');
 const newcomer=device('brand-new-user',[]);await settle();assert.equal(newcomer.sync.getStatus().consented,true,'conta nova vazia habilita persistência automática sem prompt');const newcomerSongs=[song(9000)];newcomer.replace(newcomerSongs);newcomer.sync.schedule();await new Promise(resolve=>setTimeout(resolve,1300));assert.equal(remote.get('brand-new-user').size,1,'primeira música de usuário novo é persistida automaticamente');
 assert.match(html,/Neste dispositivo/);assert.match(html,/Na nuvem/);assert.match(html,/Para enviar/);assert.match(html,/Para baixar/);assert.match(html,/Somente neste dispositivo/);assert.match(html,/Baixar diagnóstico/);assert.match(html,/Conflitos/);assert.match(html,/Sincronizar com minha conta/);assert.match(html,/Você está offline/);assert.match(html,/<div class="topbar-title">ROUDY<\/div>/);assert.doesNotMatch(html,/<button[^>]+onclick="exportarBiblioteca\(\)"/);assert.doesNotMatch(html,/<button[^>]+id="library-sync-btn"/,'painel técnico não aparece na navegação normal');assert.match(html,/downloadSyncDiagnostics\(\)[\s\S]*?await librarySync\.review\(\)\.catch\(\(\)=>null\);await librarySync\.refreshServerAudit\(\)/,'diagnóstico interno permanece disponível no código');assert.match(html,/!state\.identityBlocked/,'guard de owner não confirmado permanece intacto');
 assert.doesNotMatch(html,/openLibraryMigrationPrompt|confirmLibraryMigration|Salvar suas músicas|Salvar minhas músicas|Salvar seus eventos|Salvar meus eventos/,'migração não expõe prompts técnicos');assert.doesNotMatch(html,/exportarBiblioteca\(\{quiet:true\}\)/,'login e migração não disparam download JSON');assert.match(html,/migrateLegacyEventsInBackground\(\)/);assert.doesNotMatch(html,/setTimeout\(\(\)=>openLibrarySync\(\),0\)/,'bootstrap e login nunca abrem o painel técnico');
 const deletionSource=html.slice(html.indexOf('function deleteMusica'),html.indexOf('function parseBlocks'));assert.match(deletionSource,/librarySync\.deleteSong\(song\)/,'exclusão usa o clientId sincronizado no backend');assert.doesNotMatch(deletionSource,/setlists|repertoire/,'excluir música não altera Eventos ou repertórios');
 assert.match(sw,/simplificando-cifras-v135-roudy-icon/);assert.match(sw,/demo-library\.js\?v=3/);assert.match(sw,/study-metronome\.js\?v=2/);assert.match(sw,/study-metronome\.css\?v=3/);assert.match(sw,/song-repository\.js\?v=11/);assert.match(sw,/library-sync\.js\?v=15/);assert.match(sw,/event-repository\.js\?v=5/);assert.match(sw,/event-collaboration-client\.js\?v=10/);assert.match(sw,/app-auth\.js\?v=9/);assert.match(sw,/ui-i18n\.js\?v=1/);assert.match(sw,/tuner\.js\?v=2/);assert.match(sw,/sync-realtime\.js\?v=1/);assert.match(sw,/event-chat\.js\?v=2/);assert.match(sw,/import-library\.js\?v=1/);assert.doesNotMatch(sw,/localStorage\.(?:clear|removeItem)/,'atualização do cache não apaga biblioteca');
 console.log('library-sync.test.js: OK (seed 86/91/106/141, legacy, isolamento, convergência, offline e retry)');
})().catch(error=>{console.error(error);process.exitCode=1;});
