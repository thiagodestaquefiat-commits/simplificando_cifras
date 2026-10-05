const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const plain = value => JSON.parse(JSON.stringify(value));
function setup() {
  const memory = new Map(); let failKey = null;
  const context = { window: null, console: { log(){}, warn(){}, error(){} }, Blob, Date, structuredClone,
    crypto: global.crypto, setTimeout, clearTimeout,
    localStorage: { getItem:key=>memory.get(key)??null, setItem(key,value){if(key===failKey)throw Object.assign(new Error('quota'),{name:'QuotaExceededError'});memory.set(key,value);}, removeItem:key=>memory.delete(key), key:index=>[...memory.keys()][index], get length(){return memory.size;} } };
  context.window=context;
  for (const file of ['storage','song-model','export-library','library-recovery','import-library','song-repository','event-model','event-repository']) {
    vm.runInNewContext(fs.readFileSync(`js/${file}.js`,'utf8'),context,{filename:file});
  }
  return { context, memory, fail:key=>{failKey=key;} };
}
const {context:c,memory,fail}=setup();
const song=id=>c.songModel.create({id,title:`Música ${id}`,key:'C',blocos:[{c:'C G'}]}, {now:'2026-10-01T00:00:00Z'});
const a=song('a'),b=song('b');
memory.set('sb-project-auth-token','secret');
memory.set('sc_personal_song_caches_v1',JSON.stringify({'other-account':[b]}));
const payload=c.libraryExporter.buildExport({ownerId:'account-a',authenticated:true,musicas:[{...a,nested:{accessToken:'secret',refresh_token:'secret',futureField:'kept'}}],events:[],medleys:[],configuracoes:{theme:'dark'}});
assert.doesNotMatch(JSON.stringify(payload),/secret|other-account|Música b|armazenamentoBruto/);
assert.equal(payload.origens.sessaoAtual.musicas[0].nested.futureField,'kept');

const backup=c.libraryExporter.buildExport({ownerId:'account-a',musicas:[a,b]});
const plan=c.libraryImporter.plan(backup,[],{ownerId:'account-a'});
assert.equal(c.libraryImporter.apply(plan,[],{ownerId:'account-a',selectedIndices:[1]}).songs[0].id,'b');
assert.throws(()=>c.libraryImporter.apply(plan,[],{ownerId:'account-b'}),/conta mudou/);
assert.throws(()=>c.libraryImporter.apply(plan,[{...a,key:'D'}],{ownerId:'account-a',selectedIndices:[0]}),/biblioteca mudou/);
const conflict=c.libraryImporter.plan(backup,[{...a,key:'D'}],{ownerId:'account-a'});
const restored=c.libraryImporter.apply(conflict,[{...a,key:'D'}],{ownerId:'account-a',selectedIndices:[],conflictIndices:[0]});
assert.equal(restored.songs[0].key,'D');assert.equal(restored.songs[1].key,'C');assert.notEqual(restored.songs[1].id,'a');
assert.match(restored.songs[1].title,/cópia recuperada/);
const foreign=c.libraryExporter.buildExport({ownerId:'account-b',musicas:[{...b,librarySync:{clientId:'b-cloud',serverVersion:10}}]});
assert.equal(c.libraryImporter.apply(c.libraryImporter.plan(foreign,[],{ownerId:'account-a'}),[],{ownerId:'account-a'}).songs[0].librarySync,undefined);
const portable=c.libraryImporter.apply(c.libraryImporter.plan(foreign,[],{ownerId:'account-a'}),[],{ownerId:'account-a'});
assert.equal(portable.songs[0].accessContext.ownerId,'account-a');
assert.equal(c.libraryImporter.plan(foreign,portable.songs,{ownerId:'account-a'}).existing,1,'restauração entre contas continua idempotente');

assert.equal(c.libraryRecovery.beforeSave('account-a',[a],[{...a,key:'D'}]),true);
assert.equal(c.libraryRecovery.list('account-a')[0].song.key,'C');
assert.equal(c.libraryRecovery.list('account-b').length,0);
assert.equal(c.libraryRecovery.list('guest').length,0);
for(let i=0;i<25;i++)c.libraryRecovery.retain('account-a',[{song:{...a,key:String(i)}}]);
assert.equal(c.libraryRecovery.list('account-a').length,20);
assert.equal(c.libraryRecovery.list('account-a')[0].song.key,'24');
assert.equal(c.libraryRecovery.retain('account-a',[{song:{...a,notes:'x'.repeat(1024*1024)}}]),false);

const storageErrors=[];c.storage.subscribeErrors(error=>storageErrors.push(plain(error)));
c.storage.set('first',{before:true});fail('second');
assert.equal(c.storage.setMany([['first',{after:true}],['second',{new:true}]]),false);
assert.deepEqual(plain(c.storage.get('first')), {before:true});
assert.equal(c.storage.get('second',null),null);
assert.equal(storageErrors.length,1);assert.equal(storageErrors[0].code,'QuotaExceededError');
assert.doesNotMatch(JSON.stringify(storageErrors),/token|song|account-a/);
fail(null);

// Actual repositories: guest → A → B → A → guest, with no cross-account export/history.
const isolated=setup(),r=isolated.context.songRepository,e=isolated.context.eventRepository;
const guest=r.load([a]);
assert.equal(r.activateOwner('A',guest,[]).migrationCandidate,true);
assert.equal(r.confirmActiveOwner([a]),true);
assert.equal(r.save([{...a,key:'E'}]),true);
assert.equal(isolated.context.libraryRecovery.list('A')[0].song.key,'C');
assert.equal(r.activateOwner('B',[{...a,key:'E'}],[]).songs.length,0);
assert.equal(r.save([b]),true);
assert.equal(r.activateOwner('A',[b],[]).songs[0].key,'E');
assert.equal(r.deactivateOwner([{...a,key:'E'}])[0].key,'C');
assert.equal(isolated.context.libraryRecovery.list('guest').length,0);
e.load([]);e.activateOwner('A',[],{id:'A'},[]);e.save([{id:'event-A',title:'Privado A',leaderId:'A'}]);
assert.equal(e.activateOwner('B',[{id:'event-A',title:'Privado A',leaderId:'A'}],{id:'B'},[]).events.length,0);
assert.equal(e.deactivateOwner([]).length,0);

vm.runInNewContext(fs.readFileSync('js/medley-repository.js','utf8'),isolated.context);
isolated.context.demoLibrary={loadMedley:()=>[{chords:'C G',musicTitle:'Visitante'}],migrate:songs=>({songs,removed:0}),isDemoSong:()=>false};
const medley=isolated.context.medleyRepository;
assert.equal(medley.load(null)[0].musicTitle,'Visitante');
assert.equal(medley.load('A').length,0,'conta não absorve o medley visitante');
medley.save('A',[{chords:'D A',musicTitle:'Privado A'}]);
assert.equal(medley.load('B').length,0);
assert.equal(medley.load(null)[0].musicTitle,'Visitante');
assert.equal(medley.load('A')[0].musicTitle,'Privado A');
isolated.memory.delete('sc_guest_medley_v1');isolated.context.demoLibrary={loadMedley:()=>[{chords:'D A',musicTitle:'Privado A'}],migrate:songs=>({songs,removed:0}),isDemoSong:()=>false};
assert.equal(medley.load(null).length,0,'medley privado escrito por versão antiga não aparece como visitante');

// Failure does not confirm an edit, and existing content remains available.
isolated.fail('sc_personal_song_caches_v1');
r.activateOwner('A',[],[]);
assert.equal(r.save([{...a,key:'F'}]),false);
assert.equal(JSON.parse(isolated.memory.get('sc_personal_song_caches_v1')).A[0].key,'E');
console.log('backup-safety.test.js: OK (segredos, seleção, cópias, isolamento, histórico, quota e rollback)');
