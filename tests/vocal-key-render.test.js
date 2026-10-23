const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const context={console,Date,Math,JSON,Object,Array,String,Number,Boolean,RegExp,Error,Set};
context.window=context;vm.createContext(context);
for(const file of ['js/instruments/instrument-definitions.js','js/instruments/multi-instrument-chord-library.js','js/editor/song-format.js','js/event-model.js'])
  vm.runInContext(fs.readFileSync(file,'utf8'),context,{filename:file});
function load(start,end){const a=html.indexOf(start),b=html.indexOf(end,a);assert.ok(a>=0&&b>a,start);vm.runInContext(html.slice(a,b),context);}
load('const SHARP =','// ── SAVE / LOAD');
load('function eventKeyShift(','// A cópia da música no evento');
load('function eventEditFromSong(','// MANUTENÇÃO: O contexto captura');
const song={id:'song',title:'Canção',artist:'Equipe',key:'G',blocos:[{l:'Verso',c:'G C D\nLetra que permanece'}],fullChordSheet:{visibility:'private',source:'user_text',content:'G C D\nLetra que permanece'}};
const shared={title:song.title,artist:song.artist,key:'A',chordSheetKey:'G',chordSheet:'G C D\nLetra que permanece',songData:song};
const model=context.eventSongModel(song,shared);
assert.equal(model.originalKey,'A');
assert.match(context.songFormat.simpleText(model),/A D E/,'resumo acompanha tom automático');
assert.match(model.fullChordSheet.content,/A D E/,'letra+cifra acompanha tom automático');
assert.match(model.fullChordSheet.content,/Letra que permanece/,'não transpõe a letra');
assert.equal(song.key,'G');assert.equal(song.blocos[0].c,'G C D\nLetra que permanece','não altera a playlist');
const legacy=context.eventSongModel(song,{...shared,key:'G',chordSheetKey:undefined});
assert.match(context.songFormat.simpleText(legacy),/G C D/,'legado sem metadado continua no tom informado');
const copied=context.eventEditFromSong(context.songFormat.toLegacy(model,song));
assert.equal(copied.chordSheetKey,'A');assert.match(copied.chordSheet,/A D E/);
let event=context.eventModel.create({id:'vocal-render',leaderId:'leader',remoteVersion:1,members:[{id:'leader',name:'Líder',isLeader:true},{id:'vocal',name:'Voz',role:'Vocal'}],repertoire:[{id:'item',songId:'song',shared,personalEdits:{vocal:{key:'C',chordSheet:'C F G\nMinha versão'}}}]});
assert.equal(event.repertoire[0].shared.chordSheetKey,'G');
const personal=context.eventModel.effectiveRepertoireItem(event,'item','vocal').effective;
assert.equal(personal.chordSheetKey,'C','ajuste pessoal não herda o tom-fonte da banda');
assert.match(context.songFormat.simpleText(context.eventSongModel(song,personal,event.repertoire[0].shared)),/C F G/);
const elements=new Map();
function element(id){if(!elements.has(id))elements.set(id,{value:'',disabled:false,textContent:'',innerHTML:'',scrollTop:10,classList:{add(){},remove(){}},setAttribute(){},focus(){}});return elements.get(id);}
const calls=[];let failOnce=false;
Object.assign(context,{
  musicas:[song],setlists:[event],appCurrentUser:{id:'leader',name:'Líder'},eventSongEditCloseTimer:0,eventSongEditDraft:null,
  findEvent:()=>event,eventPermissionActor:()=>({id:'leader',name:'Líder'}),eventSongSource:()=>song,eventEsc:String,
  document:{querySelectorAll:()=>[],getElementById:element,activeElement:null},
  clearTimeout(){},setTimeout(fn){fn();return 0;},requestAnimationFrame(fn){fn();},
  showToast(){},openSD(){},closeEventSongEditSheet(){},collaborationAllowsOffline:()=>false,
  eventChat:{sendSystem(){}},eventRepository:{upsert:(_events,value)=>({events:[value]}),save(){}},
  eventCollaboration:{async saveSharedItem(value,id,changes){calls.push(changes);if(failOnce){failOnce=false;throw {status:409};}return context.eventModel.applySharedEdit(value,id,'leader',changes);},async getEvent(){return context.eventModel.create({...event,repertoire:[{...event.repertoire[0],shared:{...shared,key:'Bb'}}]});}}
});
load('function eventSharedKey(','let eventLiveRefreshRunning');
load('function eventSongEditTextForView(','function stepEventSongEditKey(');
load('async function saveEventSongEdit(','async function clearEventPersonalEdit(');
(async()=>{
  await context.changeEventOfficialKey(event.id,'item',1);
  assert.equal(calls.at(-1).key,'Bb');assert.equal(calls.at(-1).chordSheetKey,'Bb');
  assert.match(calls.at(-1).chordSheet,/Bb Eb F/,'botão + materializa a partir do texto em G, não de um falso texto em A');
  calls.length=0;failOnce=true;
  await context.changeEventOfficialKey(event.id,'item',1);
  assert.equal(calls.length,2);assert.equal(calls[1].chordSheetKey,'Bb');
  assert.match(calls[1].chordSheet,/Bb Eb F/,'retry usa o tom-fonte atual sem dupla transposição');
  context.openEventSongEdit(event.id,'item',null,'band');
  assert.match(element('event-song-edit-text').value,/A D E/,'editor abre com resumo já adaptado');
  element('event-song-edit-key').value='B';
  calls.length=0;await context.saveEventSongEdit();
  assert.equal(calls[0].key,'B');assert.equal(calls[0].chordSheetKey,'B');assert.match(calls[0].chordSheet,/B E Gb/,'edição manual materializa o novo tom uma vez');
  event=context.eventModel.applyPersonalEdit(event,'item','leader',{key:'C'});
  context.openEventSongEdit(event.id,'item',null,'personal');
  assert.match(element('event-song-edit-text').value,/C F G/,'override só de tom usa o texto da banda com sua fonte real');
  console.log('vocal-key-render: OK (resumo, letra+cifra, playlist, pessoal, editor, + e retry)');
})().catch(error=>{console.error(error);process.exitCode=1;});
