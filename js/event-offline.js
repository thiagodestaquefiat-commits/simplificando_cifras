(function(global){
  'use strict';
  const DB='roudy-event-offline-v1',TABLE='accounts',PREFIX='sc_event_offline_v1:';
  const clone=value=>JSON.parse(JSON.stringify(value));
  function createStore(){
    let connection;
    function open(){
      if(!connection)connection=new Promise((resolve,reject)=>{
        const request=global.indexedDB.open(DB,1);
        request.onupgradeneeded=()=>request.result.createObjectStore(TABLE,{keyPath:'ownerId'});
        request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>{db.close();connection=null;};resolve(db);};
        request.onerror=()=>{connection=null;reject(request.error);};
        request.onblocked=()=>{connection=null;reject(new Error('Feche outras abas para atualizar o armazenamento local.'));};
      });
      return connection;
    }
    async function read(ownerId){
      if(!global.indexedDB)return global.storage.get(PREFIX+encodeURIComponent(ownerId),null);
      const db=await open();
      return new Promise((resolve,reject)=>{const tx=db.transaction(TABLE,'readonly'),request=tx.objectStore(TABLE).get(ownerId);request.onsuccess=()=>resolve(request.result||null);request.onerror=()=>reject(request.error);});
    }
    async function write(record){
      if(!global.indexedDB){if(global.storage.set(PREFIX+encodeURIComponent(record.ownerId),record)!==true)throw new Error('Espaço insuficiente para guardar o repertório.');return;}
      const db=await open();
      await new Promise((resolve,reject)=>{const tx=db.transaction(TABLE,'readwrite');tx.objectStore(TABLE).put(record);tx.oncomplete=resolve;tx.onabort=tx.onerror=()=>reject(tx.error||new Error('Não foi possível guardar o repertório.'));});
    }
    return {read,write};
  }
  function create(options){
    const store=options.store||createStore();
    let owner=null,actor=null,generation=0,record=null,timer=null,chain=Promise.resolve(),failure=false;
    const scope=()=>options.getScope();
    function current(s,g){const next=scope();return generation===g&&next&&next.ownerId===s.ownerId&&next.actorId===s.actorId;}
    function clear(){generation++;owner=null;actor=null;record=null;failure=false;global.clearTimeout(timer);}
    async function activate(s){
      if(owner===s.ownerId&&actor===s.actorId)return;
      clear();owner=s.ownerId;actor=s.actorId;const g=generation;
      const saved=await store.read(owner);
      if(!current(s,g))return;
      if(saved?.ownerId===owner&&saved.actorId===actor&&saved.version===1)record=saved;
      options.onLoaded?.();
    }
    function song(event,item){
      const s=scope();if(!s||s.ownerId!==owner||s.actorId!==actor)return null;
      const pack=record?.packages?.find(pack=>String(pack.event.id)===String(event.id));
      return cloneOrNull(pack?.songs?.find(entry=>String(entry.itemId)===String(item.id)&&String(entry.song.id)===String(item.songId))?.song);
    }
    function cloneOrNull(value){return value?clone(value):null;}
    async function update(){
      const s=scope();if(!s){clear();return;}
      await activate(s);const g=generation;if(!current(s,g))return;
      const events=options.getEvents().filter(event=>options.canAccess(event,s.actorId));
      const packages=events.map(event=>{
        const copy=clone(event);
        copy.repertoire=copy.repertoire.map(item=>({...item,personalEdits:item.personalEdits?.[s.actorId]?{[s.actorId]:item.personalEdits[s.actorId]}:{}}));
        const songs=[],missing=[];
        for(const item of event.repertoire){
          const base=options.getSong(event,item)||song(event,item);
          if(!base){missing.push(String(item.songId));continue;}
          songs.push({itemId:item.id,song:global.stageOffline.compactSong(base)});
        }
        return {event:copy,songs,missing,preferences:options.getPreferences(s.actorId)};
      });
      const next={version:1,ownerId:s.ownerId,actorId:s.actorId,packages};
      if(JSON.stringify(next)===JSON.stringify(record))return;
      if(!current(s,g))return;
      await store.write(next);
      const verified=await store.read(s.ownerId);
      if(JSON.stringify(verified)!==JSON.stringify(next))throw new Error('Não foi possível confirmar a cópia local do repertório.');
      if(!current(s,g))return;
      record=next;failure=false;
      if(packages.some(pack=>pack.missing.length))warn(new Error('Algumas músicas do evento ainda não foram recebidas neste dispositivo. Conecte-se para carregá-las.'));
    }
    function warn(error){if(!failure){failure=true;options.onError?.(error);}}
    function flush(){global.clearTimeout(timer);const requested=scope();chain=chain.catch(()=>{}).then(update).catch(error=>{const s=scope();if(s&&s.ownerId===requested?.ownerId&&s.actorId===requested.actorId)warn(error);});return chain;}
    function schedule(){const s=scope();if(!s){clear();return;}if(s.ownerId!==owner||s.actorId!==actor){clear();}global.clearTimeout(timer);timer=global.setTimeout(flush,200);}
    return Object.freeze({schedule,flush,song,clear});
  }
  global.eventOffline=Object.freeze({create,createStore});
})(window);
