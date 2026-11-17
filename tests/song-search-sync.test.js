// Real repository + real sync coordinator; only transport/storage are simulated.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{randomUUID}=require('node:crypto');
async function main(){
 const remote=new Map(),memory=new Map();let songs=[],listener;
 const win={crypto:{randomUUID},navigator:{onLine:true},storage:{get:(k,f)=>memory.has(k)?structuredClone(memory.get(k)):f,set:(k,v)=>{memory.set(k,structuredClone(v));return true;},remove:k=>memory.delete(k)},appAuth:{getAccessToken:()=> 'test',subscribe:fn=>{listener=fn;}},apiConfig:{libraryEndpoint:path=> '/songs'+path},fetch:async(_url,options={})=>{
  let body;if(options.method==='POST')body={results:JSON.parse(options.body).items.map(item=>{const song={clientId:item.clientId,songData:item.songData,version:1,updatedAt:'2026-11-05T12:00:00Z'};remote.set(item.clientId,song);return {clientId:item.clientId,outcome:'created',song};})};else body={songs:[...remote.values()]};
  return {ok:true,status:200,json:async()=>structuredClone(body)};
 }};
 const context=vm.createContext({window:win,setTimeout,clearTimeout,structuredClone,console,Date,Map,Set});
 for(const file of ['song-model','song-repository','library-sync','song-search'])vm.runInContext(fs.readFileSync('js/'+file+'.js','utf8'),context);
 win.songRepository.activateOwner('test',[]);
 win.librarySync.initialize({getSongs:()=>songs,setSongs:next=>{songs=next;win.songRepository.save(next);},persist:next=>win.songRepository.save(next),render:()=>{}});
 listener({authenticated:true,user:{id:'test'}});await new Promise(resolve=>setImmediate(resolve));
 const deps={songs:()=>songs,owner:()=> 'test',confirmed:s=>!!s.librarySync?.syncedAt,instrument:()=> 'guitar',createSong:win.songModel.create,newId:randomUUID,toSong:x=>x,
  persist:next=>{if(!win.songRepository.save(next))return false;songs=next;return true;},sync:()=>win.librarySync.syncNow(),
  client:{catalogVersion:async()=>({}),responseToEditorModel:()=>({title:'Canção de teste',artist:'Teste',key:'C',blocos:[{l:'Intro',c:'C G'}]})}};
 const item={kind:'catalog',id:'catalog-test',title:'Canção de teste',artist:'Teste',key:'C',searchIdentity:{catalogId:'catalog-test'}};
 const search=win.songSearch.create(deps);await search.add(item);
 assert.equal(remote.size,1);assert.equal(search.state(item),'saved');assert.equal([...remote.values()][0].songData.searchIdentity.catalogId,'catalog-test');
 songs=win.songRepository.activateOwner('test',win.songRepository.load()).songs;assert.equal(win.songSearch.create(deps).state(item),'saved','reload reads persisted provenance and cloud acknowledgment');
 await search.add(item);assert.equal(remote.size,1,'repeated save remains the same remote record');
 console.log('song-search-sync.test.js: OK (real repository and sync, remote acknowledgment, reload, idempotence)');
}
main().catch(error=>{console.error(error);process.exitCode=1});
