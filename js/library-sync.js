(function(global){
  "use strict";
  const CONSENT_KEY="sc_library_sync_consent_v1",META_KEY="librarySync";
  let timer=null,context=null,lastUserId=null;
  const token=()=>global.appAuth&&global.appAuth.getAccessToken();
  function request(path,options={}){
    const access=token();if(!access)return Promise.reject(new Error("Entre com sua conta para sincronizar."));
    return global.fetch(global.apiConfig.libraryEndpoint(path),{...options,headers:{"Content-Type":"application/json",Authorization:"Bearer "+access,...options.headers}}).then(async response=>{
      const body=response.status===204?null:await response.json().catch(()=>null);
      if(!response.ok)throw new Error(body?.erro?.mensagem||"Não foi possível sincronizar a biblioteca.");return body;
    });
  }
  function uuid(){return global.crypto?.randomUUID?.()||`song-${Date.now()}-${Math.random().toString(36).slice(2)}`;}
  function metadata(song){return song&&song[META_KEY]&&typeof song[META_KEY]==="object"?song[META_KEY]:{};}
  function wireSong(song){const copy=structuredClone(song);delete copy[META_KEY];return copy;}
  function contentHash(song){let hash=2166136261;for(const char of JSON.stringify(wireSong(song))){hash^=char.charCodeAt(0);hash=Math.imul(hash,16777619);}return (hash>>>0).toString(16);}
  function prepared(songs){return songs.map(song=>metadata(song).clientId?song:{...song,[META_KEY]:{clientId:uuid(),serverVersion:null,syncedAt:null,contentHash:null}});}
  function merge(songs,remote){
    const values=songs.slice(),conflicts=[];
    for(const item of remote){
      let index=values.findIndex(song=>metadata(song).clientId===item.clientId);
      if(index<0)index=values.findIndex(song=>!metadata(song).clientId&&String(song.id)===String(item.songData?.id));
      const sync={clientId:item.clientId,serverVersion:item.version,syncedAt:item.updatedAt,contentHash:contentHash(item.songData)};
      if(index<0){values.push({...item.songData,[META_KEY]:sync});continue;}
      const local=values[index],localMeta=metadata(local),version=Number(localMeta.serverVersion)||0;
      const differs=JSON.stringify(wireSong(local))!==JSON.stringify(item.songData);
      const localDirty=Boolean(localMeta.contentHash)&&localMeta.contentHash!==contentHash(local);
      if(differs&&(!localMeta.clientId||(localDirty&&version<item.version))){
        conflicts.push({clientId:item.clientId,title:local.title});continue;
      }
      if(differs&&localDirty)continue;
      values[index]={...item.songData,[META_KEY]:sync};
    }
    return {songs:values,conflicts};
  }
  async function pull(){
    if(!context||!token())return {downloaded:0,conflicts:[]};
    const body=await request(""),before=context.getSongs(),result=merge(before,body.songs||[]);
    context.setSongs(result.songs);context.persist(result.songs);context.render();
    return {downloaded:Math.max(0,result.songs.length-before.length),conflicts:result.conflicts};
  }
  async function review(){
    const remote=(await request("")).songs||[],songs=context.getSongs(),remoteIds=new Set(remote.map(x=>x.clientId));
    return {local:songs.length,remote:remote.length,toUpload:songs.filter(song=>!remoteIds.has(metadata(song).clientId)&&!remote.some(item=>String(item.songData?.id)===String(song.id))).length};
  }
  async function syncNow(){
    if(!context||!token())throw new Error("Entre com sua conta para sincronizar.");
    const remote=await request("");
    const merged=merge(context.getSongs(),remote.songs||[]);
    if(merged.conflicts.length)throw new Error(`${merged.conflicts.length} música(s) possuem versões diferentes. Nenhuma cópia foi enviada.`);
    let songs=prepared(merged.songs);context.setSongs(songs);context.persist(songs);
    const items=songs.map(song=>({clientId:metadata(song).clientId,expectedVersion:metadata(song).serverVersion,songData:wireSong(song)}));
    const results=[];
    for(let offset=0;offset<items.length;offset+=100){
      const body=await request("/sync",{method:"POST",body:JSON.stringify({items:items.slice(offset,offset+100)})});results.push(...body.results);
    }
    const byId=new Map(results.filter(x=>x.song).map(x=>[x.clientId,x.song]));
    songs=songs.map(song=>{const remote=byId.get(metadata(song).clientId);return remote?{...song,[META_KEY]:{clientId:remote.clientId,serverVersion:remote.version,syncedAt:remote.updatedAt,contentHash:contentHash(song)}}:song;});
    context.setSongs(songs);context.persist(songs);global.storage.set(CONSENT_KEY,true);context.render();
    return {total:results.length,created:results.filter(x=>x.outcome==="created").length,existing:results.filter(x=>x.outcome==="existing").length,updated:results.filter(x=>x.outcome==="updated").length,failed:results.filter(x=>x.outcome==="failed").length};
  }
  function schedule(){if(!global.storage.get(CONSENT_KEY,false)||!token())return;clearTimeout(timer);timer=setTimeout(()=>syncNow().catch(()=>{}),1200);}
  function initialize(value){context=value;global.appAuth.subscribe(state=>{
    const userId=state.authenticated&&state.user?.id;
    if(!userId){lastUserId=null;return;}if(userId===lastUserId)return;lastUserId=userId;
    pull().catch(()=>{});
  });global.addEventListener?.("online",schedule);}
  global.librarySync=Object.freeze({consentKey:CONSENT_KEY,initialize,pull,review,syncNow,schedule,merge,prepared,wireSong,contentHash});
})(window);
