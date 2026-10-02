const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const settle=()=>new Promise(resolve=>setTimeout(resolve,15));
async function run(){
  let owner='A',listener,songs=[],resolveA,resolveB,delayB=false,persistFails=false;
  const caches=new Map(),storage=new Map();
  const record=id=>({clientId:`song-${id}`,version:1,updatedAt:'2026-10-01T00:00:00Z',songData:{id,title:`Privada ${id}`,key:'C',blocos:[{c:'C G'}]}});
  const response=body=>({ok:true,status:200,json:async()=>body});
  const context={window:null,console,structuredClone,Date,setTimeout,clearTimeout,crypto:global.crypto,navigator:{onLine:true},
    storage:{get:(key,fallback)=>storage.get(key)??fallback,set:(key,value)=>{storage.set(key,value);return true;}},
    apiConfig:{libraryEndpoint:path=>`/songs${path}`},
    appAuth:{getAccessToken:()=>owner,subscribe:fn=>{listener=fn;fn({authenticated:true,user:{id:owner}});}},
    fetch:async(_url,options)=>{
      const requestedOwner=options.headers.Authorization.slice(7);
      if(requestedOwner==='A')return new Promise(resolve=>{resolveA=resolve;});
      if(delayB)return new Promise(resolve=>{resolveB=resolve;});
      return response({songs:[record('B')]});
    },addEventListener(){} };
  context.window=context;vm.runInNewContext(fs.readFileSync('js/library-sync.js','utf8'),context);
  context.librarySync.initialize({getSongs:()=>songs,setSongs:value=>{songs=value;},render(){},
    persist:value=>{if(persistFails)return false;caches.set(owner,structuredClone(value));return true;},
    activateOwner:id=>({songs:caches.get(id)||[],migrationCandidate:false}),deactivateOwner:()=>[]});
  await settle();assert.ok(resolveA);
  owner='B';listener({authenticated:true,user:{id:'B'}});await settle();
  assert.equal(songs[0].title,'Privada B');
  resolveA(response({songs:[record('A')]}));await settle();
  assert.equal(songs.length,1);assert.equal(songs[0].title,'Privada B');
  assert.equal(context.librarySync.diagnostics().summary.cloud,1);
  assert.doesNotMatch(JSON.stringify(context.librarySync.diagnostics()),/Privada A/);

  delayB=true;const pending=context.librarySync.pull();await settle();
  owner='';listener({authenticated:false,user:null});
  resolveB(response({songs:[record('B')]}));
  await assert.rejects(pending,error=>error.code==='identity_changed');
  assert.equal(songs.length,0);assert.equal(context.librarySync.getStatus().phase,'unauthenticated');
  assert.equal(context.librarySync.diagnostics().summary.cloud,0);

  delayB=false;persistFails=true;owner='B';listener({authenticated:true,user:{id:'B'}});await settle();
  assert.equal(context.librarySync.getStatus().phase,'error');
  assert.match(context.librarySync.getStatus().error,/salvar neste dispositivo/);
  console.log('account-switch-sync.test.js: OK (resposta atrasada A/B, logout e falha de persistência)');
}
run().catch(error=>{console.error(error);process.exitCode=1;});
