const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('js/library-sync.js','utf8'),songModelSource=fs.readFileSync('js/song-model.js','utf8'),html=fs.readFileSync('index.html','utf8'),sw=fs.readFileSync('service-worker.js','utf8');
const remote=new Map(),failOnce=new Set();
function response(body,status=200){return {ok:status>=200&&status<300,status,json:async()=>structuredClone(body)};}
function song(i,extra={}){return {id:`local-${i}`,title:`Música ${i}`,artist:'Artista',key:'C',blocos:[{l:'Refrão',c:'C G',t:'Frase curta',repeticoes:2}],editorData:{sections:[{lines:[]}]},fullChordSheet:{content:'C G\nLetra + Cifras'},harmonicSummary:{blocks:[{chords:['C','G'],hook:'Frase curta'}]},...extra};}
function device(userId,initial,{online=true,consent=false,remoteFormat='camel',migrationCandidate=false}={}){
 const memory=new Map([['sc_songs_v1',structuredClone(initial)],['cifras_musicas_v1',structuredClone(initial)],['sc_musicas_v2',[{legacy:true}]],['sc_song_editor_drafts_v1',[{draft:true}]],['sc_events_v1',[{id:'event',repertoire:initial.slice(0,3).map(x=>x.id)}]]]);
 if(consent){memory.set('sc_library_sync_consent_v1',true);memory.set('sc_library_sync_consent_by_owner_v1',{[userId]:true});}
 let songs=structuredClone(initial),authUser=userId,authListener,requests=[],batches=[],statusEvents=[],ownerConfirmed=false;const networkListeners={};
 const storage={get:(k,f)=>memory.has(k)?structuredClone(memory.get(k)):f,set:(k,v)=>{memory.set(k,structuredClone(v));return true;}};
 const navigator={};Object.defineProperty(navigator,'onLine',{get:()=>online});
 async function fetch(_url,options={}){
  if(!online)throw Error('offline');const owner=String(options.headers.Authorization).slice(7),method=options.method||'GET';requests.push(method);
  const values=remote.get(owner)||new Map();remote.set(owner,values);
  if(method==='GET'){const active=[...values.values()].filter(item=>!item.deletedAt);if(remoteFormat==='snake')return response({songs:active.map(item=>({id:item.id,client_id:item.clientId,song_data:structuredClone(item.songData),version:item.version,updated_at:item.updatedAt,deleted_at:item.deletedAt}))});if(remoteFormat==='records')return response({records:active.map(item=>({id:item.id,client_id:item.clientId,song_data:structuredClone(item.songData),version:item.version,updated_at:item.updatedAt,deleted_at:item.deletedAt}))});if(remoteFormat==='invalid')return response({records:active.map(item=>({id:item.id,clientId:item.clientId,version:item.version}))});return response({songs:active});}
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
  storage,apiConfig:{libraryEndpoint:p=>'https://api.test/songs'+p},addEventListener:(name,fn)=>{networkListeners[name]=fn;},
  appAuth:{getAccessToken:()=>authUser,subscribe:fn=>{authListener=fn;fn({authenticated:Boolean(authUser),user:authUser?{id:authUser}:null});}}};
 context.window=context;vm.runInNewContext(songModelSource,context);vm.runInNewContext(source,context);
 context.librarySync.initialize({getSongs:()=>songs,setSongs:v=>songs=structuredClone(v),persist:v=>{songs=structuredClone(v);storage.set('sc_songs_v1',v);storage.set('cifras_musicas_v1',v);},render(){},activateOwner:()=>({songs:structuredClone(songs),migrationCandidate}),confirmOwner:()=>{ownerConfirmed=true;return true;}});
 context.librarySync.subscribe(value=>statusEvents.push(structuredClone(value)));
 return {sync:context.librarySync,get songs(){return songs;},get ownerConfirmed(){return ownerConfirmed;},replace:v=>{songs=structuredClone(v);storage.set('sc_songs_v1',songs);storage.set('cifras_musicas_v1',songs);},storage,requests,batches,statusEvents,
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

 const migration=device('migration-owner',five,{migrationCandidate:true});await settle();
 assert.equal(migration.sync.getStatus().phase,'needs-consent');assert.equal(migration.requests.includes('POST'),false,'abrir a oferta nunca envia automaticamente');
 migration.sync.deferMigration();assert.equal(migration.requests.includes('POST'),false,'Agora não mantém zero POST');
 await assert.rejects(()=>migration.sync.syncNow(),/backup completo/);assert.equal(migration.requests.includes('POST'),false,'migração sem backup é bloqueada');
 migration.sync.markBackupReady();const migrated=await migration.sync.syncNow();assert.deepEqual([migrated.created,migrated.failed,migrated.status.pending],[5,0,0]);assert.equal(migration.ownerConfirmed,true,'cache só é vinculado ao owner após confirmação final do backend');

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

 const convergenceA=device('convergence-user',Array.from({length:138},(_,i)=>song(1000+i)));await settle();await convergenceA.sync.syncNow();
 const convergenceB=device('convergence-user',[]);await settle();assert.equal(convergenceB.songs.length,138,'B baixa as 138 de A');
 const withThree=convergenceB.songs.concat([song(2001),song(2002),song(2003)]);convergenceB.replace(withThree);await convergenceB.sync.syncNow();
 await convergenceA.sync.pull();assert.equal(convergenceA.songs.length,141,'A recebe as 3 criadas em B');assert.equal(convergenceB.songs.length,141);assert.equal(remote.get('convergence-user').size,141);
 assert.equal((await convergenceB.sync.syncNow()).attempted,0,'B não recria client_id das músicas baixadas');

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
 assert.match(html,/Neste dispositivo/);assert.match(html,/Na nuvem/);assert.match(html,/Para enviar/);assert.match(html,/Para baixar/);assert.match(html,/Somente neste dispositivo/);assert.match(html,/Baixar diagnóstico/);assert.match(html,/Conflitos/);assert.match(html,/Sincronizar com minha conta/);assert.match(html,/Você está offline/);assert.match(html,/<div class="topbar-title">ROUDY<\/div>/);assert.doesNotMatch(html,/<button[^>]+onclick="exportarBiblioteca\(\)"/);assert.match(html,/<button[^>]+id="library-sync-btn"/);assert.match(html,/downloadSyncDiagnostics\(\)[\s\S]*?await librarySync\.review\(\)\.catch\(\(\)=>null\);await librarySync\.refreshServerAudit\(\)/,'diagnóstico aguarda a mesma coleção remota usada pelo reconciliador');assert.match(html,/!state\.identityBlocked/,'painel desabilita sincronização para owner não confirmado');
 assert.match(html,/Encontramos .* neste dispositivo/);assert.match(html,/Baixar backup completo/);assert.match(html,/Salvar na minha conta/);assert.match(html,/Agora não/);
 assert.match(sw,/simplificando-cifras-v98-personal-library-provenance/);assert.match(sw,/song-repository\.js\?v=3/);assert.match(sw,/library-sync\.js\?v=7/);assert.match(sw,/import-library\.js\?v=1/);assert.doesNotMatch(sw,/localStorage\.(?:clear|removeItem)/,'atualização do cache não apaga biblioteca');
 console.log('library-sync.test.js: OK (86 clientIds camel/snake, contrato fail-closed, legacy cross-device, reload, PWA restart, logout/login, convergência 138→141, fingerprint semântico, offline e retry)');
})().catch(error=>{console.error(error);process.exitCode=1;});
