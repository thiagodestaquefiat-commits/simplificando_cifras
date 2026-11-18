// Search orchestration only. Existing acquisition, song model and account sync remain authoritative.
(function(global){
  'use strict';
  const text=value=>String(value||'').trim();
  const normalize=value=>text(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').replace(/\s+/g,' ');
  const identity=item=>item.searchIdentity||{};
  const aliases=item=>Array.isArray(item.searchIdentities)?item.searchIdentities:[];
  function same(a,b){
    const x=identity(a),y=identity(b);
    if(x.catalogId&&y.catalogId)return String(x.catalogId)===String(y.catalogId);
    const aliasesA=[x,...aliases(a)],aliasesB=[y,...aliases(b)];
    if(aliasesA.some(left=>aliasesB.some(right=>(left.catalogId&&right.catalogId&&String(left.catalogId)===String(right.catalogId))||(left.provider&&left.sourceId&&left.provider===right.provider&&left.sourceId===right.sourceId))))return true;
    if(x.provider&&y.provider&&x.sourceId&&y.sourceId&&x.provider===y.provider)return x.sourceId===y.sourceId;
    for(const field of ['isrc','spotifyTrackId'])if(a[field]&&b[field])return normalize(a[field])===normalize(b[field]);
    const url=a.sourceUrl||a.sourceInfo?.url,other=b.sourceUrl||b.sourceInfo?.url;
    if(url&&other&&url===other)return true;
    // No title-only matching, no loss of key/arrangement/version distinctions.
    return Boolean(text(a.artist)&&text(b.artist)&&normalize(a.title)===normalize(b.title)&&normalize(a.artist)===normalize(b.artist)&&normalize(a.version||a.album)===normalize(b.version||b.album)&&normalize(a.originalKey||a.key)===normalize(b.originalKey||b.key));
  }
  function unique(items){return items.reduce((out,item)=>{const existing=out.find(value=>same(value,item));if(!existing)out.push({...item});else for(const field of ['artworkUrl','coverUrl','youtubeThumbnailUrl'])if(!existing[field]&&item[field])existing[field]=item[field];return out;},[]);}
  function create(deps){
    const pending=new Map(),models=new Map();
    let saveQueue=Promise.resolve();
    const owner=()=>String(deps.owner()||'');
    const find=item=>deps.songs().find(song=>(item.kind==='local'&&String(song.id)===String(item.id))||same(song,item));
    function state(item){const song=find(item);return !song?'new':deps.confirmed(song)?'saved':'pending';}
    async function search(query,signal){
      const account=owner(),q=normalize(query),local=deps.songs().filter(song=>normalize(song.title+' '+song.artist).includes(q)).map(song=>({...song,kind:'local'}));
      if(q.length<3)return {items:unique(local),failed:false};
      const parts=text(query).split(/\s+[—–-]\s+/),title=parts.shift(),artist=parts.join(' ');
      const results=await Promise.allSettled([deps.client.catalogVersions(title,artist,{signal}),deps.client.searchSources(query,'',{signal})]);
      if(account!==owner()||signal?.aborted)return {items:[],stale:true};
      const catalog=results[0].status==='fulfilled'?results[0].value.map(item=>({...item,kind:'catalog',searchIdentity:{catalogId:String(item.id)}})):[];
      const external=results[1].status==='fulfilled'?results[1].value.map(item=>({...item,kind:'external',searchIdentity:{provider:item.providerId,sourceId:item.sourceId}})):[];
      return {items:unique([...local,...catalog,...external]),failed:results.some(result=>result.status==='rejected'),needsLogin:results.some(result=>result.status==='rejected'&&result.reason?.kind==='authentication')};
    }
    async function resolve(item){
      if(item.kind==='local')return {song:item};
      const key=JSON.stringify([owner(),item.kind,item.searchIdentity,item.title,item.artist]);
      if(!models.has(key))models.set(key,(async()=>{
        const data=item.kind==='catalog'?await deps.client.catalogVersion(item.id):(await deps.client.generate('pesquisa',{titulo:item.title,artista:item.artist||'',sourceProvider:item.providerId,sourceId:item.sourceId})).data;
        const model=deps.client.responseToEditorModel(data,deps.instrument(),{type:'online',name:item.sourceName||item.title,url:item.sourceUrl||null});
        return {model,song:{...deps.toSong(model),searchIdentity:item.searchIdentity,...Object.fromEntries(['artworkUrl','coverUrl','isrc','spotifyTrackId','album','version'].filter(key=>item[key]).map(key=>[key,item[key]]))}};
      })().catch(error=>{models.delete(key);throw error;}));
      // Bound the transient resolved models; never persist search queries/content here.
      if(models.size>40)models.delete(models.keys().next().value);
      return models.get(key);
    }
    function add(item){
      const account=owner();
      if(!account)return Promise.reject(new Error('Entre na sua conta para salvar músicas.'));
      const key=JSON.stringify([account,item.searchIdentity,item.kind==='local'?item.id:null,normalize(item.title),normalize(item.artist),normalize(item.key)]);
      if(pending.has(key))return pending.get(key);
      const task=(async()=>{
        const resolved=find(item)|| (await resolve(item)).song;
        const perform=async()=>{
          if(account!==owner())throw new Error('A conta mudou. Faça a busca novamente.');
          let song=find(item)||find(resolved);
          let changed=false;
          if(!song){song=deps.createSong({...resolved,id:deps.newId()});if(!deps.persist([...deps.songs(),song]))throw new Error('Não foi possível salvar neste aparelho. Tente novamente.');}
          else if(!same(song,item)&&item.searchIdentity){
            // Link only after resolving the actual music, never from a title-only guess.
            song={...song,searchIdentities:[...aliases(song),item.searchIdentity].slice(-20)};
            if(!deps.persist(deps.songs().map(value=>String(value.id)===String(song.id)?song:value)))throw new Error('Não foi possível salvar neste aparelho. Tente novamente.');
            changed=true;
          }
          if(changed||!deps.confirmed(song))await deps.sync();
          if(account!==owner())throw new Error('A conta mudou. Faça a busca novamente.');
          song=find(item)||find(resolved);
          if(!song||!deps.confirmed(song))throw new Error('A música está neste aparelho, mas ainda não foi confirmada na sua conta. Tente novamente quando estiver conectado.');
          return song;
        };
        const result=saveQueue.then(perform,perform);saveQueue=result.catch(()=>{});return result;
      })().finally(()=>pending.delete(key));
      pending.set(key,task);return task;
    }
    async function open(item){const account=owner(),song=find(item);if(song)return deps.openSong(song);const resolved=await resolve(item);if(account!==owner())return;return deps.openDraft(resolved.model);}
    function suggestions(items,query){const q=normalize(query),seen=new Set();return items.flatMap(item=>[item.title,item.artist?`${item.title} — ${item.artist}`:'']).filter(value=>{const normalized=normalize(value);if(!normalized||!normalized.includes(q)||normalized===q||seen.has(normalized))return false;seen.add(normalized);return true;}).slice(0,4);}
    function remove(item){
      const song=item.kind==='local'?deps.songs().find(value=>String(value.id)===String(item.id)):find(item);
      return Boolean(song&&deps.remove(song));
    }
    return Object.freeze({search,add,remove,open,state,suggestions});
  }
  global.songSearch=Object.freeze({create,same,unique,normalize});
})(window);
