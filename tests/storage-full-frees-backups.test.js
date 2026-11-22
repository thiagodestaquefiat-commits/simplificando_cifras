// Memória cheia (22/11): ao gravar um evento, o app apaga só cópias de segurança antigas e tenta de novo.
// Músicas, eventos e preferências nunca são apagados. Limite de backups de conflito: 20.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function makeStorage(limit){const data=new Map();const size=()=>[...data].reduce((n,[k,v])=>n+k.length+v.length,0);
 return {data,get length(){return data.size},key:i=>[...data.keys()][i]??null,getItem:k=>data.has(k)?data.get(k):null,removeItem:k=>{data.delete(k)},
  setItem(k,v){const prev=data.get(k);data.set(k,String(v));if(size()>limit){if(prev===undefined)data.delete(k);else data.set(k,prev);const e=new Error('quota');e.name='QuotaExceededError';throw e;}}};}
const ls=makeStorage(6000);const ctx={console:{error(){},warn(){}},localStorage:ls};ctx.window=ctx;
vm.runInNewContext(fs.readFileSync('js/storage.js','utf8'),ctx);const storage=ctx.storage;
const songs=[{id:'s1',title:'Música importante'}];storage.set('sc_musicas_v1',songs);storage.set('sc_prefs',{tema:'escuro'});
const old=Array.from({length:40},(_,i)=>({i,pad:'x'.repeat(60)}));
ls.setItem('sc_sync_conflict_backups_v1:user',JSON.stringify(old));
ls.setItem('sc_library_recovery_v1:user',JSON.stringify(Array.from({length:20},(_,i)=>({i,pad:'y'.repeat(60)}))));
const event={id:'ev',repertoire:Array.from({length:45},(_,i)=>({id:'r'+i,title:'Louvor '+i}))};
assert.equal(storage.set('sc_events',event),true,'o evento é salvo depois de liberar espaço');
assert.deepEqual(JSON.parse(ls.getItem('sc_musicas_v1')),songs,'as músicas continuam intactas');
assert.deepEqual(JSON.parse(ls.getItem('sc_prefs')),{tema:'escuro'},'as preferências continuam intactas');
const conflicts=JSON.parse(ls.getItem('sc_sync_conflict_backups_v1:user')||'[]');
assert.ok(conflicts.length<40,'cópias de conflito antigas foram cortadas');
if(conflicts.length)assert.equal(conflicts.at(-1).i,39,'fica a cópia de conflito mais nova');
const huge='z'.repeat(9000);assert.equal(storage.set('sc_big',huge),false,'se nem assim couber, avisa a falha (sem apagar dados)');
assert.deepEqual(JSON.parse(ls.getItem('sc_musicas_v1')),songs);
assert.ok(/CONFLICT_BACKUP_LIMIT=20;/.test(fs.readFileSync('js/library-sync.js','utf8')),'limite de backups de conflito caiu para 20');
console.log('ok - memória cheia libera só backups antigos');
