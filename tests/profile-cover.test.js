const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const code=fs.readFileSync(require('node:path').join(__dirname,'../js/profile-cover.js'),'utf8');
function harness(server,cache={}){
  let user=null,listener;const notices=[];
  const w={storage:{get:(k,d)=>k in cache?structuredClone(cache[k]):d,set:(k,v)=>{cache[k]=structuredClone(v);return true;},setMany:values=>{values.forEach(([k,v])=>cache[k]=structuredClone(v));return true;}},
    appAuth:{getState:()=>({authenticated:!!user,user:user?{id:user}:null}),getAccessToken:()=>user,subscribe:fn=>{listener=fn;}},
    apiConfig:{collaborationEndpoint:()=>'/me/cover'},navigator:{onLine:true},addEventListener(){},
    setTimeout:(fn,ms)=>{const t=setTimeout(fn,ms);t.unref();return t;},showToast:msg=>notices.push(msg),
    fetch:async(url,options)=>{const owner=options.headers.Authorization.slice(7),current=server[owner]||{coverImage:null,position:{x:50,y:38},version:0};
      if(!options.method)return {ok:true,json:async()=>structuredClone(current)};
      const body=JSON.parse(options.body);if(body.baseVersion!==current.version)return {ok:false,status:409};
      const saved={coverImage:body.coverImage,position:body.position,version:current.version+1};server[owner]=saved;
      return {ok:true,status:200,json:async()=>structuredClone(saved)};
    }};
  vm.runInNewContext(code,{window:w,clearTimeout,console});
  return {w,cache,notices,async login(id){user=id;listener();await w.profileCover.refresh();}};
}
(async()=>{
  const server={},first=harness(server);
  await first.login('a');
  assert.equal(first.w.profileCover.save('data:image/jpeg;base64,b25l',{x:0,y:100}),true);
  assert.equal(await first.w.profileCover.flush(),true);
  await first.login(null);assert.equal(first.w.profileCover.get().coverImage,null,'logout não expõe a capa da conta ao visitante');
  await first.login('b');assert.equal(first.w.profileCover.get().coverImage,null,'outra conta não herda a capa');
  await first.login('a');assert.equal(first.w.profileCover.get().position.x,0);
  const second=harness(server);await second.login('a');
  assert.equal(second.w.profileCover.get().coverImage,first.w.profileCover.get().coverImage,'outro dispositivo recupera a foto da conta');
  assert.equal(second.w.profileCover.get().position.y,100,'enquadramento também chega ao outro dispositivo');
  first.w.navigator.onLine=false;
  first.w.profileCover.save('data:image/jpeg;base64,dHdv',{x:30,y:50});
  assert.equal(await first.w.profileCover.flush(),false,'alteração offline não finge envio concluído');
  first.w.navigator.onLine=true;assert.equal(await first.w.profileCover.flush(),true);
  await second.w.profileCover.refresh();assert.equal(second.w.profileCover.get().position.x,30);
  second.w.navigator.onLine=false;second.w.profileCover.save('data:image/jpeg;base64,bG9jYWw=',{x:20,y:20});
  first.w.profileCover.save(null,{x:50,y:38});await first.w.profileCover.flush();
  second.w.navigator.onLine=true;assert.equal(await second.w.profileCover.flush(),false,'edição offline conflitante não sobrescreve versão nova de outro aparelho');
  assert.equal(server.a.coverImage,null,'remoção explícita preservada no servidor');
  assert.equal(second.w.profileCover.get().pending,true,'foto conflitante continua preservada localmente');
  const third=harness(server);await third.login('a');assert.equal(third.w.profileCover.get().coverImage,null,'remoção chega a outro aparelho');
  first.w.storage.set=()=>false;assert.equal(first.w.profileCover.save('data:image/jpeg;base64,bm8=',{x:0,y:0}),false,'falha de armazenamento não anuncia sucesso');
  const legacy=harness({}, {'sc_playlist_cover_v1':'data:image/jpeg;base64,bGVnYWN5','sc_playlist_cover_position_v1':{x:0,y:40}});
  await legacy.login('legacy-a');await legacy.w.profileCover.flush();assert.equal(legacy.w.profileCover.get().position.x,0);
  await legacy.login('legacy-b');assert.equal(legacy.w.profileCover.get().coverImage,null,'migração da capa antiga ocorre uma única vez');
  console.log('profile-cover.test.js: OK (contas, dois aparelhos, offline, remoção, conflito, quota e migração)');
})().catch(e=>{console.error(e);process.exitCode=1});
