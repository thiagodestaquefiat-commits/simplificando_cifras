const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const auth=fs.readFileSync('js/app-auth.js','utf8'),collaboration=fs.readFileSync('js/event-collaboration-client.js','utf8');
(async()=>{
  const map=new Map([['sc_public_auth_config_v1',JSON.stringify({enabled:true,supabaseUrl:'https://project.supabase.co'})],['sb-project-auth-token',JSON.stringify({access_token:'private-token',user:{id:'A',email:'a@example.test'}})]]);
  let network=0;const ctx={window:null,URL,console,setTimeout,clearTimeout,navigator:{onLine:false},location:{href:'http://localhost/'},localStorage:{getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)},fetch:()=>{network++;throw Error('offline');}};ctx.window=ctx;
  vm.runInNewContext(auth,ctx);let state=await ctx.appAuth.initialize();assert.equal(state.user.id,'A');assert.equal(network,0,'reabertura não depende do SDK nem da rede');await ctx.appAuth.signOut();assert.equal(ctx.appAuth.getState().authenticated,false);assert.equal(map.has('sb-project-auth-token'),false);
  const other={...ctx,window:null};other.window=other;vm.runInNewContext(auth,other);assert.equal((await other.appAuth.initialize()).authenticated,false,'logout offline impede restauração da conta');
  const identities=new Map([['sc_event_account_identity_v1:A',{subject:'A',user:{id:'actor-A',name:'A'}}]]);
  const c={window:null,console,navigator:{onLine:false},storage:{get:(k,f)=>identities.get(k)||f,set:(k,v)=>identities.set(k,v)},appAuth:{getAccessToken:()=> 'token',getState:()=>({user:{id:'A'}})}};c.window=c;
  vm.runInNewContext(collaboration,c);assert.equal((await c.eventCollaboration.ensureRegistered()).user.id,'actor-A');c.appAuth.getState=()=>({user:{id:'B'}});await assert.rejects(c.eventCollaboration.ensureRegistered(),/Sem conexão/,'não reutiliza identidade da conta A');
  console.log('offline-auth.test.js: OK (sessão existente, sem SDK/rede, logout e identidade A/B)');
})().catch(e=>{console.error(e);process.exitCode=1;});
