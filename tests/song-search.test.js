const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const context={window:{}};vm.runInNewContext(fs.readFileSync('js/song-search.js','utf8'),context);
const {create,same,unique}=context.window.songSearch;
async function main(){
  let songs=[],owner='a',requests=0,syncs=0,fail=false,opened=0,drafts=0,resolveHook=null;
  const localStorage=new Map();
  const deps={songs:()=>songs,owner:()=>owner,confirmed:s=>!!s.librarySync?.syncedAt,instrument:()=> 'guitar',newId:()=> 'song-'+songs.length,
    client:{catalogVersions:async()=>[{id:'c1',title:'Casa',artist:'Banda',key:'C'}],searchSources:async()=>[{title:'Casa',artist:'Banda',key:'C',providerId:'web',sourceId:'w1'}],catalogVersion:async()=>{requests++;if(resolveHook)await resolveHook();return {};},generate:async()=>({data:{}}),responseToEditorModel:()=>({title:'Casa',artist:'Banda',key:'C'})},
    toSong:s=>s,createSong:s=>s,persist:next=>{songs=next;localStorage.set(owner,JSON.stringify(songs));return true;},
    sync:async()=>{syncs++;if(fail)throw new Error('offline');songs=songs.map(s=>({...s,librarySync:{syncedAt:'now',serverVersion:1}}));localStorage.set(owner,JSON.stringify(songs));},
    openSong:()=>opened++,openDraft:()=>drafts++};
  const api=create(deps),item={kind:'catalog',id:'c1',title:'Casa',artist:'Banda',key:'C',searchIdentity:{catalogId:'c1'}};
  assert.equal(api.state(item),'new'); // Playlist snapshots are deliberately not consulted.
  assert.equal((await api.search('Casa')).items.length,1,'cross-source equivalent metadata deduplicates');
  await api.open(item);assert.equal(drafts,1);assert.equal(songs.length,0,'open never saves');
  await Promise.all([api.add(item),api.add(item)]);assert.equal(songs.length,1);assert.equal(syncs,1);assert.equal(api.state(item),'saved');
  await api.add(item);assert.equal(songs.length,1);assert.equal(syncs,1,'saved result makes no upload');
  await api.open(item);assert.equal(opened,1);
  songs=JSON.parse(localStorage.get('a'));assert.equal(create(deps).state(item),'saved','reload retains account state');
  assert.equal(same(item,{...item,searchIdentity:{catalogId:'other'}}),false,'distinct catalog arrangements stay distinct');
  assert.equal(same(item,{...item,artist:'Cover',searchIdentity:{}}),false);
  assert.equal(same(item,{...item,title:'Casa (ao vivo)',searchIdentity:{}}),false);
  assert.equal(same({...item,searchIdentity:{}},{...item,key:'D',searchIdentity:{}}),false);
  assert.equal(same({title:'Casa'},{title:'Casa'}),false,'title alone is not evidence');
  assert.equal(unique([{title:'Casa',artist:'A'},{title:'Casa',artist:'B'}]).length,2);
  owner='b';songs=[];fail=true;
  await assert.rejects(api.add(item),/offline/);assert.equal(songs.length,1);assert.equal(api.state(item),'pending','failed cloud save is never a saved check');
  fail=false;await api.add(item);assert.equal(songs.length,1);assert.equal(api.state(item),'saved','retry reuses local record');
  deps.client.searchSources=async()=>{throw Error('network')};assert.equal((await api.search('Casa')).failed,true);
  deps.client.catalogVersions=async()=>[];deps.client.searchSources=async()=>[];songs=[];assert.equal((await api.search('Nada')).items.length,0,'no fictitious fallback row');
  const external={kind:'external',title:'Casa',artist:'Banda',providerId:'web',sourceId:'source-unknown-key',searchIdentity:{provider:'web',sourceId:'source-unknown-key'}};
  deps.persist([{id:'existing',title:'Casa',artist:'Banda',key:'C',librarySync:{syncedAt:'now'}}]);
  await api.add(external);assert.equal(songs.length,1);assert.equal(api.state(external),'saved');songs=JSON.parse(localStorage.get(owner));assert.equal(create(deps).state(external),'saved','resolved aliases survive reload without duplicating existing music');
  songs=[];owner='c';resolveHook=async()=>{owner='d';};await assert.rejects(api.add(item),/conta mudou/);assert.equal(songs.length,0,'account switch cannot save another user result');
  assert.equal(api.suggestions([{title:'Casa ao vivo',artist:'Banda'}],'Casa').length,2);
  assert.equal(api.suggestions([],'Casa').length,0);
  console.log('song-search.test.js: OK (identity, account persistence, concurrency, open/save, failures, suggestions)');
}
main().catch(e=>{console.error(e);process.exitCode=1});
