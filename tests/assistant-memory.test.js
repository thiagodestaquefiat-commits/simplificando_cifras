const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const box={window:{}};
for(const file of ['assistant-actions.js','assistant-action-manager.js','assistant-action-runtime.js','assistant-sequences.js','assistant-memory.js','assistant-dialogue.js'])vm.runInNewContext(fs.readFileSync('js/'+file,'utf8'),box);
const api=box.window;
const normalize=text=>String(text).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().replace(/^aumenta /,'aumentar ').replace(/^diminui /,'diminuir ').replace(/^abra /,'abrir ');
const numbers=text=>text.replace(/\bnoventa\b/g,'90').replace(/\bdois\b/g,'2');
(async()=>{
  let time=0,c={ownerId:'a',authSubject:'a',libraryOwner:'a',ready:true,screen:'song',songOpen:true,songId:'s1',eventId:null,itemId:null,canEditSong:true,canAccessEvent:true,editorOpen:false,dialogueScope:'song',eventsAll:[]};
  let values={bpm:72,capo:0,semitones:0,scrollSpeed:30,fontSize:28,chordColor:'orange',language:'pt-BR',theme:'dark'},fail=false,opened=[],saves=0;
  const event={id:'e1',repertoire:[{id:'i1',songId:'s1'},{id:'missing',songId:null},{id:'i2',songId:'s2'}]};
  const host={context:()=>({...c}),settings:()=>({...values}),settingsApplied:()=>true,updateSettings:changes=>{Object.assign(values,changes);return {ok:true};},capo:()=>values.capo,selectCapo:v=>values.capo=v,semitones:()=>values.semitones,transpose:d=>values.semitones+=d,resetTranspose:()=>values.semitones=0,
    metronome:()=>({getBpm:()=>values.bpm,setBpm:v=>{if(!fail)values.bpm=v;},isPlaying:()=>false,getMeter:()=>null,setMeter(){}}),showMetronome(){},scrollSpeed:()=>values.scrollSpeed,adjustScrollSpeed:d=>values.scrollSpeed+=d>0?3:-3,stageActive:()=>true,songFont:()=>values.fontSize,setSongFont:v=>values.fontSize=v,
    isDirty:()=>true,saveSong:()=>{saves++;return {ok:true};},legacy:()=>({ok:false,status:'clarify',message:'Desconhecido'}),
    songMatches:q=>q==='verde'?[{id:'named-green',title:'Verde'}]:[],openSong:s=>{c.songId=s.id;opened.push(s.id);},isSongOpen:id=>c.songId===id,
    eventById:id=>id===event.id?event:null,eventItemAvailable:(_,item)=>Boolean(item.songId),openEventSong:(id,item)=>{c.screen='song';c.songOpen=true;c.eventId=id;c.itemId=item;opened.push(item);},isEventSongOpen:(id,item)=>c.eventId===id&&c.itemId===item};
  const catalog=api.roudyAssistantActions.create({songMatches:host.songMatches,eventDate:()=>null,classify:()=>null});
  const native=api.roudyActionManager.create({catalog,runtime:api.roudyAssistantRuntime.create(host),normalize,numbers,now:()=>time});
  const manager=api.roudyAssistantSequences.create({manager:native,context:host.context,normalize,snapshot:()=>({...values}),restore:(k,v)=>values[k]=v,now:()=>time});
  const memory=api.roudyAssistantMemory.create({context:host.context,normalize,numbers,snapshot:()=>({...values}),now:()=>time});
  const dialogue=api.roudyAssistantDialogue.create({manager,context:host.context,normalize,numbers,memory,now:()=>time});
  const run=(text,options)=>dialogue.run(text,options);
  await run('bpm 90');assert.equal((await run('aumenta um pouco')).ok,true);assert.equal(values.bpm,95);assert.equal(values.scrollSpeed,30);
  await run('mais devagar');assert.equal(values.bpm,90);
  await run('aumentar velocidade da rolagem');await run('mais rapido');assert.equal(values.scrollSpeed,36);assert.equal(values.bpm,90);
  await run('cor da cifra azul');assert.equal((await run('prefiro verde')).ok,true);assert.equal(values.chordColor,'green');assert.deepEqual(opened,[],'a correction is not a song search');
  await run('desfazer');assert.equal(values.chordColor,'blue','contextual edits reuse undo');
  await run('mudar cor');await run('verde');await run('prefiro branco');assert.equal(values.chordColor,'white','parameter answers become context');
  await run('tema claro');await run('prefiro escuro');assert.equal(values.theme,'dark');
  await run('cor da cifra azul');assert.equal((await run('excluir musica')).awaitingResponse,true);await run('prefiro verde');assert.equal(values.chordColor,'blue','pending confirmation is not bypassed by a correction');await run('nao');assert.deepEqual(opened,[]);
  await run('idioma ingles');await run('prefiro italiano');assert.equal(values.language,'it');
  await run('capotraste 2');await run('aumentar um pouco');assert.equal(values.capo,3);await run('prefiro casa dois');assert.equal(values.capo,2);
  await run('aumentar fonte');await run('diminuir um pouco');assert.equal(values.fontSize,28);
  await run('bpm 90');values.bpm=100;assert.equal((await run('mais rapido')).awaitingResponse,true);assert.equal(values.bpm,100,'manual edit invalidates reference');await run('rolagem');assert.equal(values.scrollSpeed,39);assert.equal(values.bpm,100);
  await run('bpm 90');time+=45001;const expired=await run('mais rapido');assert.equal(expired.awaitingResponse,true);assert.equal(values.bpm,90);await run('cancelar');
  await run('bpm 90');c.songId='s2';dialogue.sync();c.songId='s1';assert.equal((await run('prefiro 100')).ok,false,'context switch clears reference even after returning');assert.equal(values.bpm,90);
  await run('cor da cifra azul');c.ownerId='b';c.authSubject='b';c.libraryOwner='b';assert.equal((await run('prefiro verde')).ok,false);assert.equal(values.chordColor,'blue');
  await run('bpm 90');await run('não aumentar um pouco');assert.equal(values.bpm,90);assert.equal((await run('prefiro 100')).ok,false);
  fail=true;await run('bpm 110');assert.equal((await run('prefiro 100')).ok,false);fail=false;
  await run('bpm 90');assert.equal((await run('prefiro 999')).ok,false);assert.equal(values.bpm,90);
  await run('capotraste 4 e bpm 96 e salvar');assert.equal(saves,1);assert.equal((await run('mais rapido')).awaitingResponse,true,'multi-control sequence has no guessed focus');await run('bpm');assert.equal(values.bpm,101);
  await run('cor da cifra azul');await run('abrir musica verde');assert.equal(opened.at(-1),'named-green','explicit title still wins');
  c.songOpen=false;c.screen='event';c.eventId='e1';c.itemId=null;await run('abra a primeira musica');assert.equal(opened.at(-1),'i1');assert.equal(c.eventId,'e1');
  const before=opened.length;assert.equal((await run('abrir segunda musica')).ok,false);assert.equal(opened.length,before,'missing item is not skipped or replaced');
  await run('abrir ultima musica');assert.equal(opened.at(-1),'i2');assert.equal((await run('abrir musica numero 9')).ok,false);
  assert.equal((await run('abrir musica numero -1')).ok,false);assert.equal(opened.at(-1),'i2','negative position must not open the first song');
  c.canAccessEvent=false;assert.equal((await run('abrir primeira musica')).ok,false);c.canAccessEvent=true;c.eventId=null;assert.equal((await run('abrir primeira musica')).ok,false);
  await run('bpm 90');await run('aumentar um pouco',{requestId:'relative-once'});assert.equal(values.bpm,95);assert.equal((await run('aumentar um pouco',{requestId:'relative-once'})).duplicate,true);assert.equal(values.bpm,95);
  c.editorOpen=true;assert.equal((await run('aumentar um pouco')).ok,false);assert.equal(values.bpm,95);
  console.log('assistant-memory: OK (relative/correction, ambiguity, expiry, manual edits, account/scope, failures, undo, event ordinals and duplicate)');
})().catch(error=>{console.error(error);process.exitCode=1;});
