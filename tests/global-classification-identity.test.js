const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
global.window=global;
require('../js/instruments/instrument-definitions.js');
require('../js/instruments/multi-instrument-chord-library.js');
require('../js/editor/song-format.js');
const chords=['A','Am','A7','A9','A7M','Amaj7','Asus2','Asus4','A/C#','Bb','Bbm','C#','C#m','C#m7','Db','Eb','E/G#','F#/A#','G/B','F C','F C G','A A7 D F','E A E C#m A E','F C G 3x','F C 4x','A D A','B7 E'];
chords.forEach(text=>assert.equal(songFormat.chordLine(text),true,text));
const lyrics=['Nosso amigo, Santo Espírito','Vem manifestar todos os sinais','O que dizer','Aleluia','O sentimento','Intro','Refrão','A vida','F C palavra','3x','(4x)'];
lyrics.forEach(text=>assert.equal(songFormat.chordLine(text),false,text));
for(const suffix of ['2x','3x','4x','(2x)','(3x)','(4x)']){
 const song={id:suffix,title:'Teste',blocos:[{l:'Refrão',c:`F C G ${suffix}\nFrase original`}]};
 const before=JSON.stringify(song),summary=songFormat.harmonicSummary(song);
 assert.equal(summary.sections[0].lines[0].chords.length,3);
 assert.equal(summary.sections[0].lines[0].repeticoes,Number(suffix.match(/\d/)[0]));
 assert.equal(JSON.stringify(song),before);
}
const html=fs.readFileSync('index.html','utf8');
const memory=new Map();
global.storage={get:(k,f)=>memory.has(k)?structuredClone(memory.get(k)):f,set:(k,v)=>{memory.set(k,structuredClone(v));return true;}};
require('../js/event-model.js');
require('../js/event-collaboration-client.js');
const library=Array.from({length:136},(_,i)=>({id:`local-${i}`,title:`Local ${i}`,blocos:[{l:'Verso',c:'F C 3x'}]}));
storage.set('sc_songs_v1',library);storage.set('cifras_musicas_v1',library);
const identity={user:{id:'old-local',name:'Local'},accessToken:'test-only-invalid',status:'registered',legacyUserIds:['local-user']};
storage.set(eventCollaboration.identityKey,identity);
storage.set('sc_current_user_v1',identity.user);
const original=JSON.stringify([...memory]);
let token='test-only-session',userId='google-a';const calls=[];
global.appAuth={getAccessToken:()=>token};
global.apiConfig={collaborationEndpoint:p=>'https://test.invalid'+p};
global.fetch=async(url,options)=>{
 calls.push({url,method:options.method});
 assert.ok(!url.includes('claim'),'no automatic ownership transfer');
 return {ok:true,status:200,json:async()=>({id:userId,name:'Google'})};
};
(async()=>{
 let subscriber;
 const scope={eventCollaboration,appIdentity:identity,appCurrentUser:identity.user,legacyCurrentUser:identity.user,appBands:[],authLinking:false,currentAuthState:{},
  renderAccountButton(){},renderSetlists(){},renderBandToolbar(){},document:{getElementById:()=>null},showToast(){throw Error('Unexpected toast');},
  appAuth:{subscribe:fn=>subscriber=fn},Object};
 vm.runInNewContext(html.slice(html.indexOf('appAuth.subscribe(async state=>{'),html.indexOf('appAuth.initialize();')),scope);
 for(let n=0;n<3;n++){
  await subscriber({authenticated:true,user:{id:userId}});
  assert.equal(scope.appCurrentUser.id,userId);
  assert.equal(JSON.stringify([...memory]),original,'login never writes local library or identity');
  token=null;await subscriber({authenticated:false,user:null});
  assert.equal(scope.appCurrentUser.id,'old-local');
  token='test-only-session';userId=n%2?'google-a':'google-b';
 }
 assert.equal(storage.get('sc_songs_v1').length,136);
 assert.equal(new Set(storage.get('sc_songs_v1').map(s=>s.id)).size,136);
 const localEvent=eventModel.create({id:'event-local',leaderId:'old-local',members:[{id:'old-local',isLeader:true}]});
 assert.equal(eventModel.isLeader(localEvent,'google-a'),false);
 assert.ok(calls.every(call=>call.method==='GET'&&call.url.endsWith('/me')));
 assert.ok(!html.includes('await syncEventsNow(true);showToast'));
 console.log('global-classification-identity.test.js: OK (classification, repeats, 136 songs unchanged, login/logout, no claim or ownership transfer)');
})().catch(error=>{console.error(error);process.exitCode=1;});
