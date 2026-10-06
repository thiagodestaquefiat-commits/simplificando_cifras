const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const context={console,Date,Intl,AbortController,setTimeout,clearTimeout,navigator:{onLine:false}};context.window=context;
for(const file of ['assistant-intent-catalog.js','assistant-intent-client.js'])vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..','js',file),'utf8'),context);
const client=context.roudyIntentClient;
assert.equal(client.classify('cara, abre aí o evento que tá mais perto').confidence,.853,'score consistente com o motor Python');
(async()=>{
  const now=new Date(2026,9,6,12),events=[{id:0,startsAt:new Date(2026,9,5,12).toISOString()},{id:1,startsAt:new Date(2026,9,13,12).toISOString()},{id:2,startsAt:new Date(2026,9,6,18).toISOString()},{id:3,startsAt:new Date(2026,9,7,12).toISOString()}];
  for(const text of ['abrir próximo evento','me mostra o próximo evento','cara, abre aí o evento que tá mais perto','abre o proximo evnto']){
    assert.equal(client.classify(text).intent,'INTENT_PROXIMO_EVENTO');assert.equal(client.fallback(text,events,now).params.evento_id,2);
  }
  assert.equal(client.fallback('o que tem amanhã',events,now).params.evento_id,3);
  for(const text of ['não abra o evento','abrir metrônomo e afinador','abrir afinador e depois configurações','evento dia 20','o banco mais próximo'])assert.equal(client.fallback(text,events,now).action,'clarify',text);
  assert.equal(client.fallback('abrir ligar metronomo',events,now).action,'clarify');
  assert.equal(client.fallback('abrir proximo evento',[],now).action,'inform');
  assert.equal(client.fallback('mostre o afinador',events,now).screen,'afinador');
  context.navigator.onLine=true;context.apiConfig={API_BASE_URL:'https://example.test'};
  let requests=0;context.fetch=async(_url,options)=>{requests++;const data=JSON.parse(options.body);assert.equal(data.events[0].id,0);assert.equal(options.credentials,'omit');return {ok:false};};
  assert.equal((await client.resolve('abrir afinador',events)).engine,'browser');assert.equal(requests,1);
  context.fetch=async()=>({ok:true,json:async()=>({action:'navigate',screen:'javascript:alert(1)',params:{},intent:'INTENT_AFINADOR',confidence:1,message:'bad'})});
  assert.equal((await client.resolve('abrir afinador',events)).screen,'afinador');
  context.fetch=async()=>({ok:true,json:async()=>({action:'navigate',screen:'detalhes_evento',params:{evento_id:999},intent:'INTENT_PROXIMO_EVENTO',confidence:1,message:'bad'})});
  assert.notEqual((await client.resolve('abrir próximo evento',events)).params.evento_id,999);
  context.fetch=async()=>({ok:true,json:async()=>({action:'navigate',screen:'afinador',params:{},intent:'INTENT_AFINADOR',confidence:1,message:'Abrindo.'})});
  assert.equal((await client.resolve('abrir afinador',events)).engine,'python');
  context.navigator.onLine=false;context.fetch=()=>{throw Error('offline não deve tentar rede');};
  assert.equal((await client.resolve('abrir afinador',events)).engine,'browser');
  console.log('assistant-intent-client.test.js: OK (fuzzy, datas, fallback, contrato e telas permitidas)');
})().catch(error=>{console.error(error);process.exitCode=1;});
