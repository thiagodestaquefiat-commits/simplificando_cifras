const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('js/app-auth.js','utf8');
function harness(){
  const calls={fetch:0,oauth:0,clients:0,scripts:[],timers:[],removed:0},data=new Map();
  let failNetwork=false,failStorage=false,disabled=false;
  const auth={getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{}}}),signInWithOAuth:async()=>{calls.oauth++;return {};}};
  const w={navigator:{onLine:true},location:{href:'https://roudy.test/'},console:{error(){}},
    setTimeout(fn,ms){const timer={fn,ms,active:true};calls.timers.push(timer);return timer;},clearTimeout(t){if(t)t.active=false;},
    apiConfig:{authEndpoint:()=>'/config'},
    localStorage:{getItem:k=>data.get(k)||null,setItem(k,v){if(failStorage)throw Error('quota');data.set(k,v);}},
    fetch:async()=>{calls.fetch++;if(failNetwork)throw Error('network');return {ok:true,json:async()=>({enabled:!disabled,supabaseUrl:'https://project.supabase.co',supabaseAnonKey:'public-example'})};}};
  const sdk={createClient(){calls.clients++;return {auth};}};
  const document={createElement:()=>({remove(){calls.removed++;}}),head:{appendChild(s){calls.scripts.push(s);}}};
  vm.runInNewContext(source,{window:w,document,URL,Promise,Set,Error});
  return {w,calls,data,sdk,network:fail=>failNetwork=fail,quota:fail=>failStorage=fail,disabled:()=>disabled=true};
}
const tick=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
(async()=>{
  const net=harness();net.w.supabase=net.sdk;net.network(true);
  await net.w.appAuth.initialize();
  await assert.rejects(net.w.appAuth.signInWithGoogle(),/Verifique sua conexão/);
  net.network(false);await net.w.appAuth.signInWithGoogle();
  assert.equal(net.calls.oauth,1);assert.equal(net.w.appAuth.getState().error,null);

  const slow=harness(),initial=slow.w.appAuth.initialize();await tick();
  assert.equal(slow.calls.scripts.length,1);
  const a=slow.w.appAuth.signInWithGoogle(),b=slow.w.appAuth.signInWithGoogle();
  assert.equal(a,b,'toques concorrentes compartilham um único login');
  await tick();assert.equal(slow.calls.oauth,0);
  slow.w.supabase=slow.sdk;slow.calls.scripts[0].onload();await Promise.all([initial,a,b]);
  assert.equal(slow.calls.clients,1);assert.equal(slow.calls.oauth,1);

  const timeout=harness(),pending=timeout.w.appAuth.initialize();await tick();
  timeout.calls.timers.find(t=>t.active&&t.ms===15000).fn();await pending;
  assert.equal(timeout.calls.removed,1);
  const retry=timeout.w.appAuth.signInWithGoogle();await tick();
  assert.equal(timeout.calls.scripts.length,2,'novo toque repete o download que expirou');
  timeout.w.supabase=timeout.sdk;timeout.calls.scripts[1].onload();await retry;
  assert.equal(timeout.calls.oauth,1);assert.equal(timeout.w.appAuth.getState().error,null);

  const blocked=harness();blocked.w.supabase=blocked.sdk;blocked.quota(true);
  blocked.data.set('sc_public_auth_config_v1','invalid-json');
  await blocked.w.appAuth.signInWithGoogle();assert.equal(blocked.calls.oauth,1,'cache corrompido/quota não bloqueiam preparação online');
  const disabled=harness();disabled.disabled();
  await assert.rejects(disabled.w.appAuth.signInWithGoogle(),/não foi configurado/);
  const offline=harness();offline.w.navigator.onLine=false;
  await assert.rejects(offline.w.appAuth.signInWithGoogle(),/Conecte-se/);assert.equal(offline.calls.fetch,0);
  console.log('auth-login-recovery: OK (rede, SDK lento/timeout, retry, concorrência, cache, offline e configuração ausente)');
})().catch(e=>{console.error(e);process.exitCode=1;});
