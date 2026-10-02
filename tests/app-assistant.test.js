const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const calls = [], elements = new Map();
const makeElement = id => ({id,style:{},dataset:{},classList:{toggle(){},contains(){return false},remove(){}},setAttribute(){},focus(){}});
const document = {documentElement:{lang:"pt-BR"},getElementById(id){if(!elements.has(id))elements.set(id,makeElement(id));return elements.get(id)},querySelectorAll(){return []}};
const settings = {language:"pt-BR",theme:"dark",chordColor:"coral",highContrast:false,colorBlind:false,scale:100};
const context = {
  console,setTimeout,clearTimeout,document,showToast(){},SpeechSynthesisUtterance:null,
  musicas:[{id:1,title:"A Alegria",artist:"Teste"}],setlists:[{id:"evento-20",title:"Culto",date:"20/10/2026",members:[]}],currentDetailId:null,currentSdId:null,
  storage:{set(_key,value){Object.assign(settings,value)}},loadAppSettings:()=>({...settings}),applyAppSettings(){},
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
vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,"..","js","app-assistant.js"),"utf8"),context);

(async()=>{
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
