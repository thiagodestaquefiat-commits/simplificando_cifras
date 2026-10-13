const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const box={window:{}};
for(const file of ['assistant-actions.js','assistant-action-manager.js','assistant-action-runtime.js','assistant-dialogue.js'])vm.runInNewContext(fs.readFileSync('js/'+file,'utf8'),box);
const {roudyAssistantActions,roudyActionManager,roudyAssistantRuntime,roudyAssistantDialogue}=box.window;
const clean=text=>String(text||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
(async()=>{
  let time=0,state={ownerId:'a',authSubject:'a',libraryOwner:'a',ready:true,songOpen:true,screen:'song',songId:'s1',canEditSong:true,editorOpen:false,eventsAll:[],events:[],dialogueScope:'song',authenticated:true};
  let settings={chordColor:'orange',language:'pt-BR',theme:'dark',scale:100},bpm=72,capo=0,meter='4/4',deleted=0,confirmations=0,legacy=0,started=0,invites=0;
  let candidates=[{id:'u1',name:'João Silva',username:'joao_silva'},{id:'u2',name:'João Santos',username:'joao_santos'}];
  const songs=[{id:'s1',title:'Canção',artist:'Ana'},{id:'s2',title:'Canção',artist:'Bia'},{id:'s3',title:'Azul',artist:'Caio'}];
  const songMatches=q=>songs.filter(song=>clean(song.title)===q||clean(song.title+' de '+song.artist)===q);
  const host={
    context:()=>({...state}),clean,localDate:value=>value,songMatches,
    settings:()=>settings,settingsApplied:()=>true,updateSettings:changes=>{settings={...settings,...changes};return {ok:true};},
    metronome:()=>({isPlaying:()=>false,getBpm:()=>bpm,setBpm:value=>{bpm=value;},getMeter:()=>meter,setMeter:value=>{meter=value;}}),showMetronome(){},
    capo:()=>capo,selectCapo:value=>{capo=value;},scrollActive:()=>false,setScrolling:()=>{started++;},
    openSong:song=>{state.songId=song.id;},isSongOpen:id=>state.songId===id,
    openEvent:event=>{state.screen='event';state.songOpen=false;state.eventId=event.id;},isEventOpen:id=>state.eventId===id,
    home:tab=>{state.screen=tab;state.songOpen=false;},isHome:tab=>state.screen===tab,
    confirm:()=>{confirmations++;return false;},deleteSong:()=>{deleted++;},songExists:()=>true,
    legacy:()=>{legacy++;return {ok:false,message:'Desconhecido.'};},
    resolveEvent:()=>({action:'choose',params:{eventos:state.events.map((_,evento_id)=>({evento_id}))}})
    ,inviteCandidates:()=>({users:candidates,hasMore:false}),invitePerson:()=>{invites++;return {ok:true};}
  };
  const catalog=roudyAssistantActions.create({songMatches,eventDate:()=>null,classify:text=>text.includes('hoje')?{intent:'INTENT_EVENTOS_HOJE'}:null});
  const manager=roudyActionManager.create({catalog,runtime:roudyAssistantRuntime.create(host),normalize:clean,numbers:text=>text,now:()=>time});
  const dialogue=roudyAssistantDialogue.create({manager,context:host.context,normalize:clean,numbers:text=>text,now:()=>time});
  assert.equal((await dialogue.run('')).awaitingResponse,true);assert.equal((await dialogue.run('cor da cifra azul')).ok,true);assert.equal(dialogue.getPending(),null,'greeting waits for one complete request');
  assert.equal((await dialogue.run('cor da cifra azul')).ok,true);assert.equal(settings.chordColor,'blue');assert.equal(dialogue.getPending(),null,'direct requests do not ask');
  let q=await dialogue.run('mudar cor da cifra',{requestId:'question'});assert.equal(q.awaitingResponse,true);assert.equal(settings.chordColor,'blue');
  assert.equal((await dialogue.run('mudar cor da cifra',{requestId:'question'})).silent,true,'duplicate transcript cannot restart the question');
  assert.equal((await dialogue.run('verde por favor')).ok,true);assert.equal(settings.chordColor,'green');assert.equal(dialogue.getPending(),null);
  await dialogue.run('mudar idioma');assert.equal((await dialogue.run('ingles')).ok,true);assert.equal(settings.language,'en');
  await dialogue.run('mudar tema');await dialogue.run('sistema');assert.equal(settings.theme,'system');
  await dialogue.run('mudar bpm');assert.equal((await dialogue.run('400')).awaitingResponse,true);assert.equal(bpm,72);await dialogue.run('90');assert.equal(bpm,90);
  await dialogue.run('mudar capotraste');await dialogue.run('casa 2');assert.equal(capo,2);
  await dialogue.run('mudar compasso');await dialogue.run('6/8');assert.equal(meter,'6/8');
  await dialogue.run('mudar escala');await dialogue.run('120 por cento');assert.equal(settings.scale,120);
  await dialogue.run('mudar cor');assert.equal((await dialogue.run('cancelar')).status,'noop');assert.equal(dialogue.getPending(),null);
  await dialogue.run('mudar cor');await dialogue.run('bpm 100');assert.equal(bpm,100);assert.equal(dialogue.getPending(),null,'a new complete action replaces the question');
  await dialogue.run('mudar cor');time+=30001;assert.equal(dialogue.getPending(),null);assert.equal((await dialogue.run('azul')).status,'blocked');assert.equal(state.songId,'s1','an expired short reply cannot open a same-name song');
  await dialogue.run('mudar cor');state.songId='s2';assert.equal((await dialogue.run('azul')).status,'blocked');assert.equal(settings.chordColor,'green');
  await dialogue.run('mudar idioma');state.ownerId='b';state.authSubject='b';state.libraryOwner='b';assert.equal(dialogue.getPending(),null);assert.equal((await dialogue.run('ingles')).status,'blocked');
  await dialogue.run('mudar cor');state.editorOpen=true;assert.equal(dialogue.getPending(),null);assert.equal((await dialogue.run('verde')).status,'blocked');assert.equal((await dialogue.run('mudar cor')).awaitingResponse,undefined);state.editorOpen=false;
  await dialogue.run('mudar cor');state.dialogueScope='modal';assert.equal((await dialogue.run('azul')).status,'blocked');state.dialogueScope='song';
  await dialogue.run('mudar cor');state.dialogueScope='other-modal';assert.equal(dialogue.getPending(),null);assert.equal((await dialogue.run('mudar bpm')).awaitingResponse,true,'a new incomplete explicit request can start after invalidation');await dialogue.run('cancelar');state.dialogueScope='song';
  await dialogue.run('mudar cor');for(const word of ['xx','yy','zz'])q=await dialogue.run(word);assert.equal(q.status,'blocked');assert.equal(dialogue.getPending(),null,'unknown answers are bounded');
  q=await dialogue.run('abrir musica cancao');assert.equal(q.awaitingResponse,true);assert.equal((await dialogue.run('de Bia')).ok,true);assert.equal(state.songId,'s2');
  q=await dialogue.run('abrir musica cancao');assert.equal(q.awaitingResponse,true);await dialogue.run('o primeiro');assert.equal(state.songId,'s1');
  await dialogue.run('abrir musica cancao');songs.splice(1,1);assert.equal((await dialogue.run('o segundo')).status,'blocked','selected id must remain eligible');
  q=await dialogue.run('excluir musica');assert.equal(q.awaitingResponse,true);assert.equal(confirmations,0);await dialogue.run('nao');assert.equal(confirmations,0);assert.equal(deleted,0);
  await dialogue.run('excluir musica');assert.equal((await dialogue.run('sim')).status,'noop');assert.equal(confirmations,1,'native confirmation remains mandatory');assert.equal(deleted,0);
  assert.equal((await dialogue.run('sim')).ok,false,'stray yes never confirms anything');
  assert.equal((await dialogue.run('nao excluir musica')).status,'blocked');assert.equal(deleted,0);
  q=await dialogue.run('iniciar rolagem');assert.equal(q.awaitingResponse,true);assert.equal(started,0);await dialogue.run('inteligente');assert.equal(started,1);
  state.eventsAll=[{id:'e1',title:'Ensaio',date:'2030-10-10',time:'15:00'},{id:'e2',title:'Culto',date:'2030-10-10',time:'19:00'}];state.events=state.eventsAll.map(event=>({event,startsAt:'2030-10-10T22:00:00Z'}));
  q=await dialogue.run('evento de hoje');assert.equal(q.awaitingResponse,true);assert.equal(state.screen,'song','asking must not navigate behind the current screen');await dialogue.run('o culto');assert.equal(state.eventId,'e2');
  state.canAccessEvent=true;state.canManageEvent=true;
  q=await dialogue.run('convida joao');assert.equal(q.awaitingResponse,true);await dialogue.run('joao silva');assert.equal(dialogue.getPending().kind,'confirm');assert.equal(invites,0);
  assert.equal((await dialogue.run('sim',{requestId:'invite-confirm'})).ok,true);assert.equal(invites,1);assert.equal((await dialogue.run('sim',{requestId:'invite-confirm'})).silent,true);assert.equal(invites,1);
  await dialogue.run('convidar joao');await dialogue.run('o segundo');candidates=[candidates[0]];assert.equal((await dialogue.run('sim')).status,'blocked');assert.equal(invites,1,'removed candidate never receives an invitation');
  await dialogue.run('convidar joao');state.canManageEvent=false;assert.equal(dialogue.getPending(),null);assert.equal((await dialogue.run('sim')).status,'blocked');assert.equal(invites,1,'lost leadership cancels confirmation');
  assert.equal(legacy,0);console.log('assistant-dialogue: OK (direct commands, slots, choices, expiry, accounts/screens, cancellation, deduplication and native confirmation)');
})().catch(error=>{console.error(error);process.exitCode=1;});
