const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const settle=()=>new Promise(resolve=>setTimeout(resolve,10));
function device(){
  let songs=[],listener,failRecovery=false,failNetwork=false,owner='A',duringUpload=null;
  const base={id:'song',title:'Canção',artist:'Artista',notes:'nota',key:'C',blocos:[{c:'C G'}]},record={clientId:'client',version:1,songData:structuredClone(base),updatedAt:'2026-10-01T00:00:00Z'};
  let records=[record];const histories=new Map(),timers=new Map(),deleted=new Set(),requests=[],storage=new Map();
  const context={window:null,console,structuredClone,Date,crypto:global.crypto,navigator:{onLine:true},
    setTimeout:(fn,delay)=>{const id=Math.random();timers.set(id,{fn,delay});return id;},clearTimeout:id=>timers.delete(id),addEventListener(){},
    storage:{get:(key,fallback)=>storage.get(key)??fallback,set:(key,value)=>{storage.set(key,structuredClone(value));return true;}},apiConfig:{libraryEndpoint:p=>'/songs'+p},
    appAuth:{getAccessToken:()=>owner,subscribe:fn=>{listener=fn;fn({authenticated:true,user:{id:owner}});}},
    libraryRecovery:{retain:(id,entries)=>{if(failRecovery)return false;histories.set(id,[...(histories.get(id)||[]),...structuredClone(entries)]);return true;}},
    fetch:async(url,options)=>{
      requests.push({url,method:options.method||'GET'});if(failNetwork)throw Error('offline');
      let body;
      if(options.method==='POST'){
        const input=JSON.parse(options.body);body={results:input.items.map(item=>{const existing=records.find(x=>x.clientId===item.clientId);if(existing&&existing.version!==item.expectedVersion)return{clientId:item.clientId,outcome:'failed',error:'conflito_versao'};const next={clientId:item.clientId,version:(existing?.version||0)+1,songData:item.songData,updatedAt:'2026-10-01T00:00:00Z'};records=records.filter(x=>x.clientId!==item.clientId).concat(next);return{clientId:item.clientId,outcome:existing?'updated':'created',song:next};})};
      }else if(options.method==='DELETE'){const expected=new URL('http://x'+url).searchParams.get('expectedVersion');assert.equal(Number(expected),records[0].version);records[0]={...records[0],version:records[0].version+1,deletedAt:'2026-10-02'};return{ok:true,status:204,json:async()=>null};}
      else body={songs:structuredClone(records)};
      if(options.method==='POST'&&duringUpload){const fn=duringUpload;duringUpload=null;fn();}
      return{ok:true,status:200,json:async()=>body};
    }};
  context.window=context;
  for(const file of ['library-sync-policy','library-sync'])vm.runInNewContext(fs.readFileSync(`js/${file}.js`,'utf8'),context);
  const sync=context.librarySync;
  sync.initialize({getSongs:()=>songs,setSongs:value=>{songs=structuredClone(value);},persist:()=>true,render(){},getPendingDeletedClientIds:()=>[...deleted],markDeleted:(value)=>{deleted.add(typeof value==='string'?value:value.librarySync.clientId);return true;},confirmDeleted:id=>{deleted.delete(id);return true;}});
  return{sync,context,base,histories,timers,requests,get songs(){return songs;},duringUpload:fn=>duringUpload=fn,edit:value=>songs=structuredClone(value),remote:value=>records=structuredClone(value),networkFail:value=>failNetwork=value,recoveryFail:value=>failRecovery=value,logout:()=>{owner='';listener({authenticated:false,user:null});}};
}
(async()=>{
  let d=device();await settle();assert.ok(d.sync.getStatus().lastConfirmedAt);assert.ok(d.songs[0].librarySync.baseSongData);
  let local=structuredClone(d.songs[0]);local.notes='nota local';d.edit([local]);d.remote([{clientId:'client',version:2,songData:{...d.base,artist:'Artista remoto'},updatedAt:'2026-10-02'}]);
  await d.sync.syncNow();assert.equal(d.songs[0].artist,'Artista remoto');assert.equal(d.songs[0].notes,'nota local');assert.equal(d.sync.getStatus().phase,'synced');assert.equal(d.histories.size,0,'campos independentes não precisam de cópia');
  local=structuredClone(d.songs[0]);local.blocos=[{c:'D A'}];local.updatedAt='2099-01-01';d.edit([local]);d.remote([{clientId:'client',version:4,songData:{...d.base,artist:'Artista remoto',notes:'nota local',blocos:[{c:'E B'}]},updatedAt:'2026-10-03'}]);
  await d.sync.syncNow();assert.equal(d.songs[0].blocos[0].c,'E B','servidor ativo independente do relógio local');assert.equal(d.histories.get('A')[0].song.blocos[0].c,'D A');assert.equal(d.sync.getStatus().conflicts,0);
  await d.sync.syncNow();assert.equal(d.histories.get('A').length,1,'não recria conflito já tratado');
  d.remote([{clientId:'client',version:5,songData:{...d.base,blocos:[{c:'F C'}]},deletedAt:'2026-10-03'}]);
  await d.sync.pull();assert.equal(d.songs.length,0);assert.ok(d.histories.get('A').some(entry=>entry.reason==='exclusão recebida da nuvem'));

  d=device();await settle();local=structuredClone(d.songs[0]);local.artist='local';d.edit([local]);d.remote([{clientId:'client',version:2,songData:{...d.base,artist:'remoto'}}]);d.recoveryFail(true);
  await assert.rejects(d.sync.pull(),/preservar a outra edição/);assert.equal(d.songs[0].artist,'local','quota não descarta edição local');assert.equal(d.sync.getStatus().phase,'error');assert.equal(d.sync.getStatus().lastConfirmedAt,null);assert.ok([...d.timers.values()].some(timer=>timer.delay===5000));
  d.recoveryFail(false);await d.sync.syncNow();assert.equal(d.songs[0].artist,'remoto');assert.equal(d.histories.get('A')[0].song.artist,'local');
  d.remote([{clientId:'client',version:1,songData:d.base}]);await assert.rejects(d.sync.pull(),/desatualizada/);assert.equal(d.songs[0].artist,'remoto','resposta antiga não desfaz edição confirmada');
  d.remote([]);await assert.rejects(d.sync.pull(),/biblioteca vazia/);assert.equal(d.songs.length,1,'resposta vazia inesperada mantém biblioteca');
  d.networkFail(true);await assert.rejects(d.sync.syncNow());assert.equal(d.songs.length,1);assert.equal(d.sync.getStatus().lastConfirmedAt,null);d.logout();assert.equal(d.timers.size,0,'logout cancela tentativas da conta anterior');

  d=device();await settle();const deletedSong=structuredClone(d.songs[0]);d.edit([]);d.sync.deleteSong(deletedSong);d.remote([{clientId:'client',version:2,songData:{...d.base,notes:'edição remota após exclusão local'}}]);await d.sync.syncNow();assert.ok(d.histories.get('A').some(entry=>entry.song.notes==='edição remota após exclusão local'));assert.equal(d.songs.length,0);

  // A resolução manual herdada do GitHub também deve preservar versões e isolar contas.
  d=device();await settle();
  const pending={...d.songs[0],notes:'local manual',librarySync:{...d.songs[0].librarySync,conflict:{remoteVersion:2,remoteSongData:{...d.base,notes:'remoto manual'}}}};
  d.edit([pending]);d.recoveryFail(true);
  assert.throws(()=>d.sync.resolveConflict('client','remote'),/guardar a cópia/);
  assert.equal(d.songs[0].notes,'local manual');
  d.recoveryFail(false);d.sync.resolveConflict('client','remote');
  assert.equal(d.songs[0].notes,'remoto manual');assert.equal(d.songs[0].librarySync.baseSongData.notes,'remoto manual');
  assert.equal(d.histories.get('A')[0].song.notes,'local manual');
  assert.equal(d.sync.conflictBackups()[0].songData.notes,'local manual');
  assert.equal(d.sync.getStatus().lastConfirmedAt,null,'escolha manual não confirma a nuvem sem consulta');
  d.logout();assert.equal(d.sync.conflictBackups().length,0,'sem login não expõe cópias privadas');
  assert.throws(()=>d.sync.resolveConflict('client','local'),/Entre com sua conta/);

  const policy=d.context.librarySyncPolicy;
  d=device();await settle();d.edit([{...d.songs[0],capo:'2'}]);
  d.duringUpload(()=>d.edit([{...d.songs[0],notes:'editada enquanto enviava'}]));
  await d.sync.syncNow();assert.equal(d.songs[0].capo,'2');assert.equal(d.songs[0].notes,'editada enquanto enviava');assert.equal(d.sync.getStatus().phase,'pending','edição durante envio não é confirmada indevidamente');
  await d.sync.syncNow();assert.equal(d.songs[0].notes,'editada enquanto enviava');assert.equal(d.sync.getStatus().phase,'synced');
  let result=policy.resolve(d.base,{...d.base,notes:'local'},{...d.base,artist:'remote'});assert.equal(result.preserve,false);assert.equal(result.song.notes,'local');
  result=policy.resolve(d.base,{...d.base,key:'D'},{...d.base,fullChordSheet:{content:'E B\nNova letra'}});assert.equal(result.preserve,true,'tom e letra são tratados juntos');
  assert.equal(policy.resolve(null,{...d.base,notes:'local'},d.base).preserve,true,'sem base histórica preserva antes de substituir');
  console.log('sync-recovery.test.js: OK (mescla, conflito, relógio, exclusões, quota, resposta vazia, retry e logout)');
})().catch(error=>{console.error(error);process.exitCode=1;});
