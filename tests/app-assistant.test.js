const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const calls = [], elements = new Map();
const makeElement = id => ({id,style:{},dataset:{},classList:{toggle(){},contains(){return false},remove(){}},setAttribute(){},focus(){}});
const document = {documentElement:{lang:"pt-BR"},getElementById(id){if(!elements.has(id))elements.set(id,makeElement(id));return elements.get(id)},querySelector(){return null},querySelectorAll(){return []}};
const settings = {language:"pt-BR",theme:"dark",chordColor:"coral",highContrast:false,colorBlind:false,scale:100};
const context = {
  console,setTimeout,clearTimeout,document,showToast(){},SpeechSynthesisUtterance:null,
  musicas:[{id:1,title:"A Alegria",artist:"Teste"}],setlists:[{id:"evento-20",title:"Culto",date:"20/10/2026",members:[]}],currentDetailId:null,currentSdId:null,currentTab:'musicas',appCurrentUser:{id:'local'},detailEditOwner:'local',detailEditBaseline:{},selectedCapo:0,currentSemitones:0,
  storage:{set(_key,value){Object.assign(settings,value);return true;}},loadAppSettings:()=>({...settings}),applyAppSettings(value){document.documentElement.lang=value.language;document.documentElement.classList.toggle('a11y-high-contrast',value.highContrast);},
  closeEventChat(){},closeDetail(){calls.push(["closeSong"])},closeModal(){},closeSD(){calls.push(["closeEvent"])},switchTab:tab=>calls.push(["tab",tab]),openDetail:id=>calls.push(["song",id]),openSD:id=>calls.push(["event",id]),
  openTuner:()=>calls.push(["tuner"]),selectTunerInstrument:id=>calls.push(["tunerInstrument",id]),stopTuner(){},toggleTunerMicrophone(){},openToolsMetronome:()=>calls.push(["metronome"]),
  toolsMetronome:{bpm:132,setBpm(bpm){this.bpm=bpm;calls.push(["bpm",bpm])},getBpm(){return this.bpm},setMeter:meter=>calls.push(["meter",meter]),isPlaying:()=>false,toggle(){},stop(){calls.push(["toolsMetronomeStop"])}},studyMetronome:{bpm:72,setBpm(bpm){this.bpm=bpm;calls.push(["songBpm",bpm])},getBpm(){return this.bpm},setMeter:meter=>calls.push(["songMeter",meter]),isPlaying:()=>false,start(){calls.push(["songMetronomeStart"])},stop(){calls.push(["songMetronomeStop"])}},renderMusicas(){},
  openAppSettings(){calls.push(["settings"])},openAppearanceSettings(){calls.push(["appearance"])},openLanguageSettings(){calls.push(["languageSettings"])},openHelpSupport(){},openProfileSettings(){},openToolsMenu(){},openAccountModal(){},loginAppAccount(){},logoutAppAccount(){},
  openBandManager(){},openLibrarySync(){},downloadSyncDiagnostics(){},copyRoudyPixCode(){},aiHarmonicSummary:{open(){calls.push(["generateWithAi"])}},openAddSetlist(){},editMusica(){},deleteMusica(){},setSongView(){},setInstrument(){},
  selectCapo(){},transpose(){},resetTranspose(){},toggleSmartScroll(){},toggleAutoScroll(){},stopAutoScroll(){},stopSmartScroll(){},enterStageMode(){},exitStageMode(){},adjustStageFont(){},adjustStageScrollSpeed(){},navigateSong(){},
  librarySync:{syncNow(){}},youtubeUI:{searchFromInternal(){}},openEventChat(){},editSetlistById(){},sharePlaylist(){},openEventLeadershipTransfer(){},openEventNotifications(){},openStageFromEvent(){},
  abrirAddMedley(){},abrirSalvarMedley(){},limparMedley(){}
};
context.findEvent=id=>context.setlists.find(event=>event.id===id);context.window=context;
const rootClasses=new Set();document.documentElement.classList={contains:key=>rootClasses.has(key),toggle:(key,value)=>value?rootClasses.add(key):rootClasses.delete(key)};
context.requestAnimationFrame=callback=>callback();context.tunerInstrument='guitar';
context.selectTunerInstrument=value=>{context.tunerInstrument=value;calls.push(['tunerInstrument',value]);};
context.closeDetail=()=>{calls.push(['closeSong']);context.currentDetailId=null;document.getElementById('view-detail').style.display='none';};
context.closeSD=()=>{calls.push(['closeEvent']);context.currentSdId=null;document.getElementById('view-sd').style.display='none';};
context.openDetail=id=>{calls.push(['song',id]);context.currentDetailId=id;document.getElementById('view-detail').style.display='flex';};
context.openSD=id=>{calls.push(['event',id]);context.currentSdId=id;document.getElementById('view-sd').style.display='flex';};
context.switchTab=tab=>{context.currentTab=tab;calls.push(['tab',tab]);};
for(const controller of [context.studyMetronome,context.toolsMetronome]){controller.meter=null;controller.setMeter=function(value){this.meter=value;calls.push([this===context.studyMetronome?'songMeter':'meter',value]);};controller.getMeter=function(){return this.meter;};}
context.selectCapo=value=>{context.selectedCapo=value;};context.transpose=value=>{context.currentSemitones+=value;};context.resetTranspose=()=>{context.currentSemitones=0;};
for(const script of ['assistant-intent-catalog.js','assistant-intent-client.js','assistant-language.js','assistant-actions.js','assistant-action-manager.js','assistant-action-runtime.js','assistant-memory.js','assistant-dialogue.js','assistant-sequences.js','app-assistant.js'])vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,"..","js",script),"utf8"),context);

(async()=>{
  let smartActive=false,tunerActive=false,smartStarts=0,tunerStarts=0;
  context.smartScrollController={isActive:()=>smartActive};context.tunerController={isRunning:()=>tunerActive};context.scrollTimer=null;
  context.toggleSmartScroll=async()=>{smartStarts++;smartActive=!smartActive;};context.stopSmartScroll=()=>{smartActive=false;};context.toggleTunerMicrophone=async()=>{tunerStarts++;tunerActive=!tunerActive;};context.stopTuner=()=>{tunerActive=false;};context.startAutoScroll=()=>{context.scrollTimer=1;};context.stopAutoScroll=()=>{context.scrollTimer=null;};
  context.currentDetailId=1;document.getElementById('view-detail').style.display='flex';
  for(const command of ['ative a rolagem inteligente','ligar rolagem por áudio','retome a rolagem inteligente'])assert.equal((await context.roudyAssistant.run(command)).ok,true);
  assert.equal(smartStarts,1,'ativação repetida não reinicia progresso');
  for(const command of ['interrompa a rolagem inteligente','desligar rolagem inteligente'])assert.equal((await context.roudyAssistant.run(command)).ok,true);
  assert.equal(smartActive,false);assert.equal(smartStarts,1);
  for(const command of ['iniciar rolagem automática','continuar rolagem automática'])await context.roudyAssistant.run(command);assert.equal(context.scrollTimer,1);
  await context.roudyAssistant.run('desabilite a rolagem automática');assert.equal(context.scrollTimer,null);
  await context.roudyAssistant.run('iniciar afinador');await context.roudyAssistant.run('ative o afinador');assert.equal(tunerStarts,1);await context.roudyAssistant.run('interromper afinador');assert.equal(tunerActive,false);
  await context.roudyAssistant.run('ativar alto contraste');assert.equal(settings.highContrast,true);await context.roudyAssistant.run('desative alto contraste');assert.equal(settings.highContrast,false);
  await context.roudyAssistant.run('metrônomo em cento e vinte e cinco');assert.equal(context.studyMetronome.bpm,125);
  await context.roudyAssistant.run('compasso seis por oito');assert.ok(calls.some(c=>c[0]==='songMeter'&&c[1]==='6/8'));
  assert.equal((await context.roudyAssistant.run('compasso dois por oito')).ok,false);
  assert.equal((await context.roudyAssistant.run('metrônomo em duzentos e cinquenta')).ok,false);assert.equal(context.studyMetronome.bpm,125);
  const contextualStart=calls.length;await context.roudyAssistant.run('abrir metrônomo');assert.equal(calls.slice(contextualStart).some(c=>c[0]==='metronome'),false);
  await context.roudyAssistant.run('compasso 3/4');assert.equal(calls.at(-1)[1],'3/4');
  let playing=false,starts=0;context.studyMetronome.isPlaying=()=>playing;context.studyMetronome.start=async()=>{starts++;playing=true;};context.studyMetronome.stop=()=>{playing=false;calls.push(['songMetronomeStop']);};
  await context.roudyAssistant.run('iniciar metrônomo');await context.roudyAssistant.run('continue o metrônomo');assert.equal(starts,1,'repetir início não reinicia metrônomo');await context.roudyAssistant.run('silencie o metrônomo');assert.equal(playing,false);
  context.studyMetronome.start=async()=>{};assert.equal((await context.roudyAssistant.run('iniciar metrônomo')).ok,false,'falha de áudio não anuncia início');context.studyMetronome.start=async()=>{playing=true;calls.push(['songMetronomeStart']);};
  const unknownStart=calls.length;assert.equal((await context.roudyAssistant.run('xyz sem comando')).ok,false);assert.equal(calls.length,unknownStart);
  context.toggleSmartScroll=async()=>{throw new Error('Microfone bloqueado');};assert.equal((await context.roudyAssistant.run('iniciar rolagem inteligente')).ok,false);
  context.musicas.push({id:2,title:'A Alegria',artist:'Outro'});const ambiguousStart=calls.length;assert.equal((await context.roudyAssistant.run('abrir A Alegria')).ok,false);assert.equal(calls.length,ambiguousStart);await context.roudyAssistant.run('abrir A Alegria de Outro');assert.equal(calls.at(-1)[1],2);context.musicas.pop();
  context.currentDetailId=null;document.getElementById('view-detail').style.display='none';
  await context.roudyAssistant.run("mude o idioma para inglês");assert.equal(settings.language,"en");
  await context.roudyAssistant.run("afinador para ukulele");assert.ok(calls.some(call=>call[0]==="tunerInstrument"&&call[1]==="ukulele"));
  await context.roudyAssistant.run("metrônomo em 132 bpm");assert.ok(calls.some(call=>call[0]==="bpm"&&call[1]===132));
  await context.roudyAssistant.run("gerar com IA");assert.ok(calls.some(call=>call[0]==="generateWithAi"));
  context.currentDetailId=1;document.getElementById("view-detail").style.display="flex";document.getElementById("study-metronome").hidden=false;const songMetronomeStart=calls.length;await context.roudyAssistant.run("aciona o metrônomo");const songMetronomeCalls=calls.slice(songMetronomeStart);assert.ok(songMetronomeCalls.some(call=>call[0]==="songMetronomeStart"));assert.ok(!songMetronomeCalls.some(call=>call[0]==="metronome"),"dentro da música não deve abrir o metrônomo geral");await context.roudyAssistant.run("colocar metrônomo a 96");assert.ok(calls.some(call=>call[0]==="songBpm"&&call[1]===96));await context.roudyAssistant.run("acelere o metrônomo");assert.ok(calls.some(call=>call[0]==="songBpm"&&call[1]===101));await context.roudyAssistant.run("desacelere o metrônomo");assert.ok(calls.some(call=>call[0]==="songBpm"&&call[1]===96));await context.roudyAssistant.run("interrompa o metrônomo");assert.ok(calls.some(call=>call[0]==="songMetronomeStop"));context.currentDetailId=null;document.getElementById("view-detail").style.display="none";
  await context.roudyAssistant.run("A Alegria");assert.ok(calls.some(call=>call[0]==="song"&&call[1]===1));
  await context.roudyAssistant.run("evento dia 20 de 10 de 2026");assert.ok(calls.some(call=>call[0]==="event"&&call[1]==="evento-20"));
  elements.get("view-detail").style.display="flex";const eventStart=calls.length;await context.roudyAssistant.run("evento dia 20 de 10 de 2026");const eventCalls=calls.slice(eventStart);assert.ok(eventCalls.findIndex(call=>call[0]==="closeSong")<eventCalls.findIndex(call=>call[0]==="event"),"a música deve fechar antes de o evento abrir");assert.equal(elements.get("view-detail").style.display,"none");
  await context.roudyAssistant.run("evento dia vinte de outubro de 2026");assert.ok(calls.filter(call=>call[0]==="event"&&call[1]==="evento-20").length>=2);
  await context.roudyAssistant.run("por favor me leva para as configurações");assert.ok(calls.some(call=>call[0]==="settings"));
  await context.roudyAssistant.run("Roudy, troca o idioma para espanhol");assert.equal(settings.language,"es");
  await context.roudyAssistant.run("Roudy, toca A Alegria");assert.ok(calls.filter(call=>call[0]==="song"&&call[1]===1).length>=2);
  elements.get("view-sd").style.display="flex";const songStart=calls.length;await context.roudyAssistant.run("Roudy, toca A Alegria");const songCalls=calls.slice(songStart);assert.ok(songCalls.findIndex(call=>call[0]==="closeEvent")<songCalls.findIndex(call=>call[0]==="song"),"o evento deve fechar antes de a música abrir");assert.equal(elements.get("view-sd").style.display,"none");
  console.log("app-assistant.test.js: OK (linguagem natural, idioma, ferramentas, música e evento por data)");
})().catch(error=>{console.error(error);process.exitCode=1});
