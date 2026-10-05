const assert=require('node:assert/strict');
global.window={appAuth:{getAccessToken:()=>token},apiConfig:{sharedSongsEndpoint:path=>'https://api.test/'+path}};
let token='account-a',calls=0;
global.fetch=async(url,options)=>{calls++;assert.equal(options.headers.Authorization,'Bearer account-a');return{ok:true,json:async()=>({report:{id:'r1',status:'pending'}})};};
require('../js/song-reports.js');
(async()=>{
  assert.equal((await window.songReports.request('s1/reports',{method:'POST',body:'{}'})).report.id,'r1');
  token=null;await assert.rejects(window.songReports.request('reports'),/Entre na sua conta/);assert.equal(calls,1);
  token='account-a';global.fetch=async()=>{token='account-b';return{ok:true,json:async()=>({})};};
  await assert.rejects(window.songReports.request('reports'),/A conta mudou/);
  global.fetch=async()=>{throw new TypeError('Network error');};
  await assert.rejects(window.songReports.request('reports'),/Sem conexão/);
  global.fetch=async()=>({ok:false,json:async()=>({erro:{mensagem:'Acesso negado'}})});
  await assert.rejects(window.songReports.request('reports'),/Acesso negado/);
  console.log('song-reports.test.js: OK (autenticação, troca de conta, erro e conexão)');
})().catch(error=>{console.error(error);process.exitCode=1;});
