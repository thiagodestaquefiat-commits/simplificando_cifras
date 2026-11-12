// Header personalization is account-scoped, not a playlist cover. Persist first;
// sync afterwards. Keep pending offline edits until the server acknowledges them.
(function(global){
  'use strict';
  const KEY='sc_profile_covers_v1',listeners=new Set(),flights=new Map();
  let timer;
  // Aviso na tela só logo depois de a pessoa escolher a foto; tentativas em segundo plano (ao voltar
  // para o app, ficar online...) ficam em silêncio — antes o aviso aparecia toda vez.
  let userSavedAt=0;
  const auth=()=>global.appAuth?.getState?.();
  const owner=()=>auth()?.authenticated?String(auth().user.id):'guest';
  const records=()=>global.storage.get(KEY,{})||{};
  const notify=()=>listeners.forEach(fn=>fn());
  const position=value=>({x:Number.isFinite(Number(value?.x))?Math.max(0,Math.min(100,Number(value.x))):50,y:Number.isFinite(Number(value?.y))?Math.max(0,Math.min(100,Number(value.y))):38});
  function persist(id,value){const all=records();all[id]=value;return global.storage.set(KEY,all)!==false;}
  function get(){
    const id=owner(),all=records();
    if(all[id])return {...all[id],position:position(all[id].position)};
    // Old unscoped covers are claimed only once, by the first authenticated
    // account using this browser after migration. Never copy between accounts.
    const legacy=global.storage.get('sc_playlist_cover_v1','');
    const value={coverImage:legacy||null,position:position(global.storage.get('sc_playlist_cover_position_v1',null)),pending:id!=='guest'&&Boolean(legacy),revision:'legacy'};
    if(id!=='guest'&&legacy){
      all[id]=value;
      if(!global.storage.setMany([[KEY,all],['sc_playlist_cover_v1',''],['sc_playlist_cover_position_v1',{x:50,y:38}]]))return {coverImage:null,position:{x:50,y:38}};
    }
    return value;
  }
  function schedule(){clearTimeout(timer);timer=global.setTimeout(()=>refresh(),600);}
  function save(coverImage,nextPosition){
    const id=owner(),previous=get();
    const value={coverImage:coverImage||null,position:position(nextPosition),pending:id!=='guest',version:previous.version,revision:Date.now()+':'+Math.random()};
    if(!persist(id,value))return false;
    userSavedAt=Date.now();notify();schedule();return true;
  }
  async function run(id,token){
    const url=global.apiConfig.collaborationEndpoint('/me/cover');
    const headers={'Content-Type':'application/json',Authorization:'Bearer '+token};
    const snapshot=records()[id];
    const response=await global.fetch(url,{headers});
    if(!response.ok)throw new Error('Não foi possível recuperar a capa da conta.');
    const remote=await response.json();
    let local=records()[id];
    // A legacy browser-wide photo is not a newer user action. An existing
    // account choice (including removal) wins over automatic migration.
    if(local?.revision==='legacy'&&remote.version>0){
      if(!persist(id,{...remote,pending:false,revision:'server:'+remote.version}))throw new Error('Não foi possível guardar a capa neste aparelho.');
      if(owner()===id)notify();return;
    }
    if(local?.rejected)return; // foto recusada: fica só neste aparelho até a pessoa escolher outra
    if(!local?.pending){
      if(local?.revision!==snapshot?.revision)return;
      if(!persist(id,{...remote,pending:false,revision:'server:'+remote.version}))throw new Error('Não foi possível guardar a capa neste aparelho.');
      if(owner()===id)notify();return;
    }
    if(local.version!=null&&local.version!==remote.version){
      if(owner()===id)global.showToast?.('A capa mudou em outro aparelho. Sua alteração local foi preservada; escolha a foto novamente para confirmar.');
      // Preserve local content while giving a subsequent explicit selection the
      // current server base version. Do not silently overwrite either image.
      persist(id,{...local,version:remote.version,conflict:true});return;
    }
    if(local.conflict)return;
    const sent=local;
    const saved=await global.fetch(url,{method:'PUT',headers,body:JSON.stringify({coverImage:sent.coverImage,position:sent.position,baseVersion:remote.version})});
    if(saved.status===409){
      const body=await saved.json().catch(()=>null);
      persist(id,{...records()[id],...(Number.isInteger(body?.cover?.version)?{version:body.cover.version}:{}),conflict:true});
      throw new Error('A capa foi alterada em outro aparelho. Sua foto local foi preservada.');
    }
    if(saved.status===400||saved.status===413){
      // Foto recusada pelo servidor (grande demais ou inválida): não adianta tentar de novo a cada
      // abertura do app. Continua aparecendo neste aparelho; escolher outra foto tenta de novo.
      persist(id,{...records()[id],pending:false,rejected:true});
      throw new Error('Não foi possível enviar essa foto para a conta. Ela continua neste aparelho; escolha uma foto menor para salvar na conta.');
    }
    if(!saved.ok)throw new Error('A capa continua salva neste aparelho e aguarda envio para a conta.');
    const result=await saved.json();local=records()[id];
    if(local?.revision===sent.revision){
      if(!persist(id,{...result,pending:false,revision:sent.revision}))throw new Error('Não foi possível confirmar a capa neste aparelho.');
    }else if(local){persist(id,{...local,version:result.version});schedule();}
    if(owner()===id)notify();
  }
  function refresh(){
    const id=owner(),token=global.appAuth?.getAccessToken?.();get();
    if(id==='guest'||!token||global.navigator?.onLine===false)return Promise.resolve();
    if(flights.has(id))return flights.get(id);
    const flight=run(id,token).catch(error=>{
      const justSaved=Date.now()-userSavedAt<15000;
      if(owner()===id&&justSaved)global.showToast?.(error.message);else console.info('[capa]',error.message);
    }).finally(()=>flights.delete(id));
    flights.set(id,flight);return flight;
  }
  async function flush(){clearTimeout(timer);await refresh();return owner()==='guest'||!get().pending;}
  global.profileCover=Object.freeze({get,save,refresh,flush,subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);}});
  global.appAuth?.subscribe?.(()=>{notify();refresh();});
  global.addEventListener('online',refresh);
  global.addEventListener('focus',refresh);
})(window);
