const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const box = { window: {} };
for (const file of ['assistant-actions.js', 'assistant-action-manager.js', 'assistant-action-runtime.js']) vm.runInNewContext(fs.readFileSync(`js/${file}`, 'utf8'), box);
const { roudyAssistantActions, roudyActionManager, roudyAssistantRuntime } = box.window;
const clean = text => String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

(async () => {
  let state = { ownerId:'local', ready:true, songOpen:true, songId:'s1', screen:'song', canEditSong:true, eventId:null, authenticated:false, canAccessEvent:false, canManageEvent:false, tunerVisible:false, tunerStringCount:6 };
  let settings = { language:'pt-BR', chordColor:'orange', theme:'dark', scale:100, highContrast:false, colorBlind:false };
  let settingsOK = true, tuner = false, starts = 0, stops = 0, selectedString = null, selectedInstrument = 'guitar', instrument = 'guitar', view = 'full', speed = 30, font = 28, stage = false, confirmed = false, deleted = false;
  const flows = [], songs = [{id:'s1',title:'Canção',artist:'Autor'}];
  const host = {
    context:()=>({...state}), clean, localDate:value=>value, songMatches:query=>songs.filter(song=>clean(song.title)===query), legacy:()=>{throw new Error('No legacy side effects');},
    settings:()=>settings, updateSettings:changes=>{if(settingsOK)settings={...settings,...changes};return {ok:settingsOK};}, settingsApplied:()=>settingsOK,
    openPanel:destination=>{flows.push(destination);return {ok:true};}, back:()=>false,
    showTuner:()=>{state.tunerVisible=true;}, tunerVisible:()=>state.tunerVisible, tunerActive:()=>tuner,
    startTuner:async()=>{starts++;tuner=true;}, stopTuner:()=>{stops++;tuner=false;}, selectTunerInstrument:value=>{selectedInstrument=value;}, tunerInstrument:()=>selectedInstrument,
    selectTunerString:index=>{selectedString=index;}, tunerString:()=>selectedString,
    instrument:()=>instrument, setInstrument:value=>{instrument=value;}, songViewAvailable:value=>value!=='tablature', songView:()=>view, setSongView:value=>{view=value;},
    nextSong:()=>null, stageActive:()=>stage, setStage:value=>{stage=value;}, songFont:()=>font, setSongFont:value=>{font=value;}, scrollSpeed:()=>speed, adjustScrollSpeed:delta=>{speed+=delta>0?3:-3;},
    openGenerator:mode=>{flows.push(mode);return true;}, editSong:()=>true, confirm:()=>confirmed, deleteSong:()=>{deleted=true;}, songExists:()=>!deleted,
    medleyCount:()=>0, createEvent:()=>true, eventWorkflow:operation=>{flows.push(operation);return {ok:true,message:'Fluxo aberto.'};},
    login:()=>({ok:false,message:'Login indisponível.'}), logout:()=>{}, authenticated:()=>state.authenticated,
    sync:()=>{}, syncPhase:()=> 'conflict', backupWorkflow:()=>({ok:false}), copyPix:()=>({ok:false})
  };
  const catalog = roudyAssistantActions.create({songMatches:host.songMatches,eventDate:()=>null,classify:()=>null});
  const manager = roudyActionManager.create({catalog,runtime:roudyAssistantRuntime.create(host),normalize:clean,numbers:clean});
  const run = async (text, id, ok=true) => {const result=await manager.run(text);assert.equal(result.action,id,text);assert.equal(result.ok,ok,JSON.stringify(result));return result;};
  assert.equal(manager.getCatalog().length,49);
  for (const [name,value] of Object.entries({portugues:'pt-BR',espanhol:'es',ingles:'en',italiano:'it',frances:'fr',alemao:'de'})) {await run(`mudar idioma para ${name}`,'settings.language');assert.equal(settings.language,value);}
  await run('cor da cifra dourado','settings.color');assert.equal(settings.chordColor,'gold');
  await run('cor da cifra azul','settings.color');assert.equal(settings.chordColor,'blue');
  await run('tema claro','settings.theme');assert.equal(settings.theme,'light');
  await run('iniciar alto contraste','settings.accessibility');assert.equal(settings.highContrast,true);
  await run('parar alto contraste','settings.accessibility');assert.equal(settings.highContrast,false);
  await run('iniciar modo daltonico','settings.accessibility');assert.equal(settings.colorBlind,true);
  await run('tamanho da interface 120','settings.scale');assert.equal(settings.scale,120);
  for(const bad of ['cor da cifra inexistente','mudar idioma para ingles espanhol','tamanho -110','tamanho 150','tema claro escuro','mudar idioma para ingles e mudar cor da cifra azul'])assert.equal((await manager.run(bad)).ok,false,bad);
  settingsOK=false;await run('cor da cifra verde','settings.color',false);assert.equal(settings.chordColor,'blue');settingsOK=true;
  for(const command of ['abrir configuracoes','abrir meu perfil','abrir ferramentas','abrir notificacoes','abrir backup'])await run(command,'navigation.panel');
  await run('afinador para ukulele','tuner.open');assert.equal(selectedInstrument,'ukulele');
  await run('iniciar afinador','tuner.play');await run('iniciar afinador','tuner.play');assert.equal(starts,1);
  await run('corda 4','tuner.string');assert.equal(selectedString,3);
  state.tunerStringCount=4;await run('corda 5','tuner.string',false);assert.equal(selectedString,3);
  await run('parar afinador','tuner.play');assert.equal(tuner,false);
  host.startTuner=()=>{};await run('iniciar afinador','tuner.play',false);
  let release;host.startTuner=()=>new Promise(resolve=>{release=()=>{tuner=true;resolve();};});
  const listening=manager.run('iniciar afinador');await Promise.resolve();state.songId='s2';release();assert.equal((await listening).status,'blocked');assert.equal(tuner,false,'late microphone permission must not leak into another song');assert.ok(stops>=2);state.songId='s1';
  await run('instrumento para teclado','song.instrument');assert.equal(instrument,'keyboard');
  await run('ver tablatura','song.view',false);assert.equal(view,'full','incompatible tabs do not silently select summary');
  await run('ver letra','song.view');assert.equal(view,'lyrics');
  await run('proxima musica','song.step');assert.equal((await manager.run('proxima musica')).status,'noop');
  await run('aumentar velocidade da rolagem','scroll.speed');assert.equal(speed,33);
  await run('aumentar fonte','song.font',false);await run('modo palco','stage.play');await run('aumentar fonte','song.font');assert.equal(font,30);
  await run('excluir musica','song.delete');assert.equal(deleted,false,'cancelled native confirmation preserves song');confirmed=true;await run('excluir musica','song.delete');assert.equal(deleted,true);
  state.eventId='e1';state.canAccessEvent=true;await run('excluir musica','song.delete',false);
  await run('editar evento','event.workflow',false);state.canManageEvent=true;
  for(const text of ['editar evento','compartilhar evento','ver integrantes','adicionar musica ao evento','excluir evento'])await run(text,'event.workflow');
  await run('convidar integrante','event.workflow',false);state.authenticated=true;await run('convidar integrante','event.workflow');
  state.editorOpen=true;for(const text of ['mudar idioma para ingles','abrir playlist','gerar com ia','convidar integrante','exportar backup'])assert.equal((await manager.run(text)).status,'blocked','preserves open editor');state.editorOpen=false;
  await run('sincronizar agora','library.sync',false);await run('sair da conta','account.logout',false);state.authenticated=false;
  await run('fazer login','account.login',false);await run('exportar backup','backup.workflow',false);await run('copiar pix','contribution.pix',false);
  for(const text of ['gerar com ia','busca por ia','adicionar por arquivo','adicionar por texto','abrir camera'])await run(text,'music.generate');
  await run('salvar medley','medley.workflow');await run('criar evento','event.create');
  assert.equal((await manager.run('mudar cor azul e excluir evento')).ok,false);
  console.log('assistant-second-delivery: OK (preferences, tools, views, permissions, editor protection, confirmations, failed/stale effects)');
})().catch(error=>{console.error(error);process.exitCode=1;});
