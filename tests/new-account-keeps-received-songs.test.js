// Conta nova (sem músicas na nuvem) recebe o catálogo inicial. Se a pessoa salvar uma playlist
// compartilhada enquanto esse primeiro download acontece, as músicas recebidas não podem sumir.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('js/library-sync.js','utf8'),songModelSource=fs.readFileSync('js/song-model.js','utf8');
const demos=[{id:'demo-1',title:'Demo',artist:'Roudy',key:'C',blocos:[]}];
const memory=new Map(),storage={get:(k,f)=>memory.has(k)?structuredClone(memory.get(k)):f,set:(k,v)=>{memory.set(k,structuredClone(v));return true;}};
let songs=[],releaseGet;const gate=new Promise(resolve=>{releaseGet=resolve;});
async function fetch(url,options={}){const method=options.method||'GET';if(method==='GET'){await gate;return {ok:true,status:200,json:async()=>({songs:[]})};}
 const body=JSON.parse(options.body);return {ok:true,status:200,json:async()=>({results:body.items.map((item,i)=>({clientId:item.clientId,outcome:'created',song:{id:'s'+i,clientId:item.clientId,songData:item.songData,version:1,updatedAt:new Date().toISOString(),deletedAt:null}}))})};}
const navigator={onLine:true};
const context={console,structuredClone,setTimeout,clearTimeout,crypto:global.crypto,fetch,navigator,storage,
 demoLibrary:{isDemoSong:v=>String(v?.id||'').startsWith('demo-'),catalog:()=>structuredClone(demos)},
 apiConfig:{libraryEndpoint:p=>'https://api.test/songs'+p},addEventListener(){},
 appAuth:{getAccessToken:()=>'isabela',subscribe:fn=>fn({authenticated:true,user:{id:'isabela'}})}};
context.window=context;vm.runInNewContext(songModelSource,context);vm.runInNewContext(source,context);
context.librarySync.initialize({getSongs:()=>songs,setSongs:v=>{songs=structuredClone(v);},persist:v=>{songs=structuredClone(v);},render(){},
 activateOwner:()=>({songs:[],migrationCandidate:false,awaitingRemoteOnboarding:true}),deactivateOwner:()=>[],seedNewOwner:()=>structuredClone(demos),
 confirmOwner:()=>true,markDeleted:()=>true,confirmDeleted:()=>true,getDeletedClientIds:()=>[],getPendingDeletedClientIds:()=>[]});
(async()=>{
 await new Promise(r=>setTimeout(r,5));
 // A amiga salva a playlist recebida enquanto o primeiro download da conta ainda não terminou.
 songs=[...songs,{id:'shared_abc',title:'Louvor recebido',artist:'Banda',key:'G',blocos:[]}];
 releaseGet();await new Promise(r=>setTimeout(r,30));
 const ids=songs.map(s=>s.id);
 assert.ok(ids.includes('shared_abc'),'a música recebida continua na biblioteca: '+ids.join(','));
 assert.ok(ids.includes('demo-1'),'o catálogo inicial da conta nova continua entrando');
 console.log('ok - conta nova mantém as músicas da playlist recebida');
})().catch(e=>{console.error(e);process.exit(1);});
