const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('js/library-sync.js','utf8'),remote=new Map();
function device(userId,initial,online=true){
 const memory=new Map([['sc_songs_v1',structuredClone(initial)],['cifras_musicas_v1',structuredClone(initial)],['sc_events_v1',[{id:'event',repertoire:initial.slice(0,2).map(x=>x.id)}]]]);
 let songs=structuredClone(initial),listener;
 const storage={get:(k,f)=>memory.has(k)?structuredClone(memory.get(k)):f,set:(k,v)=>{memory.set(k,structuredClone(v));return true;}};
 async function fetch(_url,options={}){
  if(!online)throw Error('offline');const owner=String(options.headers.Authorization).slice(7),method=options.method||'GET';
  const values=remote.get(owner)||new Map();remote.set(owner,values);
  if(method==='GET')return response({songs:[...values.values()]});
  const body=JSON.parse(options.body),results=body.items.map(item=>{
   const existing=values.get(item.clientId);
   if(existing&&item.expectedVersion!==existing.version)return {clientId:item.clientId,outcome:'failed',error:'conflito_versao'};
   const outcome=existing?JSON.stringify(existing.songData)===JSON.stringify(item.songData)?'existing':'updated':'created';
   const value={id:existing?.id||`server-${values.size}`,clientId:item.clientId,songData:structuredClone(item.songData),version:existing?(outcome==='updated'?existing.version+1:existing.version):1,updatedAt:new Date().toISOString(),deletedAt:null};
   values.set(item.clientId,value);return {clientId:item.clientId,outcome,song:value};
  });return response({results});
 }
 const context={window:null,console,structuredClone,setTimeout,clearTimeout,crypto:global.crypto,fetch,
  storage,apiConfig:{libraryEndpoint:p=>'https://api.test/songs'+p},appAuth:{getAccessToken:()=>userId,subscribe:fn=>{listener=fn;fn({authenticated:Boolean(userId),user:{id:userId}});}}};
 context.window=context;vm.runInNewContext(source,context);
 context.librarySync.initialize({getSongs:()=>songs,setSongs:v=>songs=structuredClone(v),persist:v=>{songs=structuredClone(v);storage.set('sc_songs_v1',v);storage.set('cifras_musicas_v1',v);},render(){}});
 return {sync:context.librarySync,get songs(){return songs;},replace:v=>{songs=structuredClone(v);storage.set('sc_songs_v1',songs);storage.set('cifras_musicas_v1',songs);},storage,setOnline:v=>online=v,emit:s=>listener(s)};
}
function response(body){return {ok:true,status:200,json:async()=>structuredClone(body)};}
function song(i){return {id:`local-${i}`,title:`Música ${i}`,artist:'Artista',key:'C',blocos:[{l:'Refrão',c:'C G'}],editorData:{sections:[{lines:[]}]},fullChordSheet:{content:'C G\nTexto'}};}
(async()=>{
 const original=Array.from({length:136},(_,i)=>song(i)),anonymous=device('',original);
 assert.equal(anonymous.songs.length,136);assert.equal(remote.size,0,'sem login não envia');
 const a=device('user-a',original),review=await a.sync.review();
 assert.equal(JSON.stringify(review),JSON.stringify({local:136,remote:0,toUpload:136}));assert.equal(remote.get('user-a').size,0,'review não envia');
 const eventsBefore=JSON.stringify(a.storage.get('sc_events_v1'));
 const first=await a.sync.syncNow();assert.equal(first.created,136);assert.equal(first.failed,0);
 assert.equal(a.storage.get('sc_songs_v1').length,136);assert.equal(a.storage.get('cifras_musicas_v1').length,136);
 assert.equal(JSON.stringify(a.storage.get('sc_events_v1')),eventsBefore,'eventos e ordem não mudam');
 const second=await a.sync.syncNow();assert.equal(second.existing,136);assert.equal(remote.get('user-a').size,136);
 const b=device('user-a',[]);await new Promise(resolve=>setTimeout(resolve));assert.equal(b.songs.length,136,'outro dispositivo recebe biblioteca');
 assert.deepEqual(b.songs[0].editorData,original[0].editorData);assert.equal(b.songs[0].fullChordSheet.content,original[0].fullChordSheet.content);
 const edited=a.songs;edited[0]={...edited[0],artist:'Atualizado no A',updatedAt:'2027-01-01T00:00:00Z'};a.replace(edited);await a.sync.syncNow();
 await b.sync.pull();assert.equal(b.songs[0].artist,'Atualizado no A','dispositivo sem edição recebe versão remota nova');
 const localEdit=b.songs;localEdit[1]={...localEdit[1],artist:'Edição B',updatedAt:'2027-01-02T00:00:00Z'};b.replace(localEdit);
 const editA=a.songs;editA[1]={...editA[1],artist:'Edição A',updatedAt:'2027-01-03T00:00:00Z'};a.replace(editA);await a.sync.syncNow();
 const concurrent=await b.sync.pull();assert.equal(b.songs[1].artist,'Edição B');assert.equal(concurrent.conflicts.length,1,'edições concorrentes não sobrescrevem');
 const outsider=device('user-b',[]);await new Promise(resolve=>setTimeout(resolve));assert.equal(outsider.songs.length,0,'usuário B isolado');
 const existingDevice=device('user-a',structuredClone(original));await new Promise(resolve=>setTimeout(resolve));
 assert.equal(existingDevice.songs.length,136,'IDs locais iguais não são duplicados em outro dispositivo');
 const divergent=structuredClone(original);divergent[0].artist='Edição local';
 const conflictDevice=device('user-a',divergent);const conflicts=await conflictDevice.sync.pull();
 assert.equal(conflictDevice.songs.length,136);assert.equal(conflictDevice.songs[0].artist,'Edição local');assert.ok(conflicts.conflicts.length,'conflito não sobrescreve');
 const offline=device('offline-user',[song(999)],false);await assert.rejects(()=>offline.sync.syncNow());
 assert.equal(offline.songs.length,1);assert.equal(offline.storage.get('sc_songs_v1').length,1);
 a.emit({authenticated:false,user:null});assert.equal(a.storage.get('sc_songs_v1').length,136,'logout preserva local');
 console.log('library-sync.test.js: OK (consent, 136 songs, idempotency, devices, isolation, offline, complete Song, event references)');
})().catch(error=>{console.error(error);process.exitCode=1;});
