const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const box={window:{}};
for(const name of ['assistant-language.js','assistant-actions.js','assistant-action-manager.js','assistant-action-runtime.js','assistant-sequences.js','assistant-memory.js','assistant-dialogue.js'])vm.runInNewContext(fs.readFileSync('js/'+name,'utf8'),box);
const api=box.window;
const normalize=t=>String(t).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const numbers=t=>t.replace('cento e vinte e cinco','125').replace(/\bnoventa\b/g,'90').replace(/\bdois\b/g,'2').replace(/\btres\b/g,'3').replace(/\bquatro\b/g,'4');
(async()=>{
  let state={ownerId:'a',authSubject:'a',libraryOwner:'a',ready:true,screen:'song',songOpen:true,songId:'song',canEditSong:true,eventId:'event',itemId:'item',canAccessEvent:true,canManageEvent:true,authenticated:true,editorOpen:false,stageActive:true,eventsAll:[],events:[],tunerVisible:true,tunerStringCount:6};
  let values={capo:0,bpm:72,chordColor:'orange',language:'pt-BR',theme:'dark'},calls=[],confirmed=0,deleted=0,semantic=null;
  const song={id:'named',title:'Apagar esta musica'};
  const host={context:()=>({...state}),metronome:()=>({getBpm:()=>values.bpm,setBpm:v=>{values.bpm=v;calls.push('bpm');},getMeter:()=>null,isPlaying:()=>false}),showMetronome(){},
    capo:()=>values.capo,selectCapo:v=>{values.capo=v;calls.push('capo');},settings:()=>({...values}),settingsApplied:()=>true,updateSettings:changes=>{Object.assign(values,changes);calls.push('preference');return {ok:true};},
    stageActive:()=>true,songFont:()=>28,setSongFont:()=>calls.push('font'),isDirty:()=>true,saveSong:()=>{calls.push('save');return {ok:true};},legacy:()=>({ok:false,status:'clarify',message:'Desconhecido.'}),confirm:()=>{confirmed++;return false;},deleteSong:()=>deleted++,songExists:()=>true,
    songMatches:q=>q==='apagar esta musica'?[song]:[],openSong:s=>{state.songId=s.id;calls.push('song');},isSongOpen:id=>state.songId===id,
    resolveEvent:raw=>{semantic=raw;return {action:'inform',message:'Sem evento.'};},openPanel:()=>({ok:true}),showTuner(){},tunerVisible:()=>true,tunerInstrument:()=> 'guitar'};
  const catalog=api.roudyAssistantActions.create({songMatches:host.songMatches,eventDate:text=>{const m=text.match(/^evento dia (\d+)$/);return m?{day:Number(m[1])}:null;},classify:text=>/amanha/.test(text)?{intent:'INTENT_EVENTOS_AMANHA'}:/hoje/.test(text)?{intent:'INTENT_EVENTOS_HOJE'}:/proximo evento/.test(text)?{intent:'INTENT_PROXIMO_EVENTO'}:null});
  const manager=api.roudyActionManager.create({catalog,runtime:api.roudyAssistantRuntime.create(host),normalize,numbers});
  const dialogue=api.roudyAssistantDialogue.create({manager,context:host.context,normalize,numbers});
  const allowedMissing=new Set(['mudar bpm','mudar capotraste','mudar compasso','mudar cor','mudar idioma','mudar tema','mudar instrumento','mudar escala','mudar tom']);
  const covered=new Set();
  for(const {phrase,command} of api.roudyAssistantLanguage.getExamples()){
    const actual=manager.resolve(phrase),expected=manager.resolve(command);
    assert.equal(actual.definition?.id,expected.definition?.id,phrase+' → '+command);
    assert.equal(JSON.stringify(actual.slots),JSON.stringify(expected.slots),phrase);
    if(!allowedMissing.has(command))assert.ok(actual.definition?.id!=='compatibility.legacy',phrase+' must map to a native action');
    if(actual.definition&&actual.definition.id!=='compatibility.legacy')covered.add(actual.definition.id);
  }
  const grammar=[['ritmo em noventa','metronome.bpm'],['ajustar andamento para cento e vinte e cinco','metronome.bpm'],['usar capo na casa dois','song.capo'],['usar compasso tres por quatro','metronome.meter'],['afinar minha guitarra','tuner.open'],['afinar a corda dois','tuner.string'],['tocar com teclado','song.instrument'],['deixar cifras verdes','settings.color'],['usar o aplicativo em ingles','settings.language'],['usar interface 120 por cento','settings.scale'],['ensaiar musica Apagar esta musica','song.open'],['pesquisar na minha playlist Alegria','search.playlist'],['buscar gravacao de Alegria no youtube','search.youtube'],['chame Joao para o evento','event.invite-person'],['ensaiar para amanha','event.agenda'],['ensaiar dia 20','event.date'],['mostrar primeira cancao','event.song']];
  grammar.push(['mostrar evento chamado Culto','event.open']);
  for(const [phrase,id] of grammar){assert.equal(manager.resolve(phrase).definition?.id,id,phrase);covered.add(id);}
  assert.equal(covered.size,48,'all native action types (except compatibility) covered');
  assert.equal((await dialogue.run('escolher andamento')).awaitingResponse,true);assert.equal((await dialogue.run('90')).ok,true);assert.equal(values.bpm,90);
  for(const phrase of ['nao apagar esta musica','nunca enviar alteracoes para a nuvem','nao quero afinar','se eu pedir apagar esta musica','caso eu queira sair da conta','ritmo em -90','ritmo em 999','ritmo 90,5','usar capo na casa 15','usar compasso 9 por 8','usar interface 999 por cento','colocar o aplicativo em klingon','apagar todas as minhas musicas e exportar backup','iniciar metronomo e apagar esta musica','escutar meu instrumento e apagar esta musica']){
    calls=[];assert.equal((await dialogue.run(phrase)).ok,false,phrase);assert.deepEqual(calls,[],phrase+' must not partially execute');
  }
  const question=await dialogue.run('esta dificil de ler');assert.equal(question.awaitingResponse,true);assert.equal(calls.length,0);assert.equal((await dialogue.run('contraste')).ok,true);assert.equal(values.highContrast,true);
  state.eventId=null;state.itemId=null;
  assert.equal((await dialogue.run('apagar esta musica')).awaitingResponse,true);assert.equal(deleted,0);await dialogue.run('sim');assert.equal(confirmed,1);assert.equal(deleted,0,'native confirmation retained');
  await dialogue.run('abrir musica Apagar esta musica');assert.equal(state.songId,'named','literal title is not deletion');
  await dialogue.run('ensaiar para amanha');assert.equal(semantic,'evento de amanha','date semantics reach native resolver');
  assert.equal(manager.resolve('abrir configuracoez').definition?.id,'navigation.panel','small typo on navigation only');
  assert.equal(manager.resolve('apagarr esta musica').definition?.id,'compatibility.legacy','no fuzzy deletion');
  assert.equal(manager.resolve('importarr backup').definition?.id,'compatibility.legacy','no fuzzy private import/export');
  state.eventId='event';state.canManageEvent=false;calls=[];assert.equal((await dialogue.run('montar repertorio do evento')).ok,false);assert.deepEqual(calls,[]);
  state.editorOpen=true;assert.equal((await dialogue.run('esta dificil de ler')).status,'blocked');state.editorOpen=false;
  const sequence=api.roudyAssistantSequences.create({manager,context:host.context,normalize,snapshot:()=>({...values}),restore:(k,v)=>values[k]=v});
  calls=[];assert.equal((await sequence.run('capotraste 2 e ajustar andamento 90')).completed,2);assert.deepEqual(calls,['capo','bpm']);
  values.capo=0;calls=[];assert.equal((await sequence.run('usar capo na casa dois e ritmo noventa')).completed,2);assert.deepEqual(calls,['capo','bpm']);
  values.capo=0;calls=[];assert.equal((await sequence.run('usar capo na casa dois e ritmo noventa e guardar meus ajustes')).completed,3);assert.deepEqual(calls,['capo','bpm','save']);
  assert.equal(manager.resolve('subir tom dois tons').slots.delta,4);assert.equal(manager.resolve('descer tom dois semitons').slots.delta,-2);
  calls=[];assert.equal((await manager.run('corda -2')).ok,false);assert.equal((await manager.run('evento dia -20')).ok,false);assert.deepEqual(calls,[]);
  const dateRule=catalog.find(action=>action.id==='event.date');assert.ok(dateRule.validate({day:20,month:'0'}));assert.ok(dateRule.validate({day:31,month:2,year:2026}));assert.equal(dateRule.validate({day:29,month:2,year:2028}),null);
  assert.equal(manager.resolve('ensaiar musica Deus e Um So').slots.query,'deus e um so','numbers in titles remain data');assert.equal(manager.resolve('chame Joao Dois').slots.query,'joao dois');assert.equal(manager.resolve('mostrar evento chamado Ensaio de Amanha').definition.id,'event.open','explicit event title is not a relative date');
  assert.equal(manager.resolve('ensaiar musica Se Nao Fosse Voce').definition.id,'song.open','negation in a literal title remains data');
  assert.equal(manager.resolve('ensaiar musica Meu Proximo Evento').definition.id,'song.open','explicit music title cannot become calendar navigation');
  console.log('assistant-language: OK ('+api.roudyAssistantLanguage.getExamples().length+' aliases, '+covered.size+' native actions, parameters, ambiguity, negation, sensitive confirmations and scope)');
})().catch(error=>{console.error(error);process.exitCode=1;});
