(function(global){
  'use strict';
  const catalog=global.roudyIntentCatalog,fillers=new Set(catalog.fillers);
  const screens={INTENT_PROXIMO_EVENTO:'detalhes_evento',INTENT_EVENTOS_HOJE:'detalhes_evento',INTENT_EVENTOS_AMANHA:'detalhes_evento',INTENT_AFINADOR:'afinador',INTENT_METRONOMO:'metronomo',INTENT_CONFIGURACOES:'configuracoes',INTENT_PLAYLIST:'playlist'};
  function normalize(text){return String(text||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().match(/[a-z0-9]+/g)?.filter(t=>!fillers.has(t)).map(t=>catalog.aliases[t]||t).join(' ')||'';}
  // Mesmo matching-block ratio de difflib, sem dependência ou download de modelo.
  function ratio(a,b){
    let matches=0;const pending=[[0,a.length,0,b.length]];
    while(pending.length){
      const [alo,ahi,blo,bhi]=pending.pop();let size=0,ai=alo,bi=blo,previous=new Map();
      for(let i=alo;i<ahi;i++){
        const current=new Map();for(let j=blo;j<bhi;j++)if(a[i]===b[j]){const length=(previous.get(j-1)||0)+1;current.set(j,length);if(length>size){size=length;ai=i-length+1;bi=j-length+1;}}
        previous=current;
      }
      if(size){matches+=size;if(alo<ai&&blo<bi)pending.push([alo,ai,blo,bi]);if(ai+size<ahi&&bi+size<bhi)pending.push([ai+size,ahi,bi+size,bhi]);}
    }
    return a.length+b.length?2*matches/(a.length+b.length):1;
  }
  function similarity(a,b){const left=a.split(' '),right=b.split(' '),sa=new Set(left),sb=new Set(right);const overlap=2*[...sa].filter(t=>sb.has(t)).length/(sa.size+sb.size);return .55*Math.max(ratio(a,b),ratio(left.sort().join(' '),right.sort().join(' ')))+.45*overlap;}
  function conceptPresent(concept,tokens){const words=normalize(concept).split(' ');return words.length===1?tokens.some(t=>t===words[0]||(t.length>=5&&words[0].length>=5&&ratio(t,words[0])>=.84)):tokens.join(' ').includes(words.join(' '));}
  function classify(text){
    if(typeof text!=='string'||text.length>500)return {intent:null,confidence:0,reason:'invalid_input'};
    const value=normalize(text),tokens=value.split(' ');if(!value)return {intent:null,confidence:0,reason:'empty_input'};
    if(tokens.some(t=>['nao','nunca','nem','sem'].includes(t)))return {intent:null,confidence:0,reason:'negated_command'};
    if([' e depois ',' em seguida ',';'].some(t=>text.toLowerCase().includes(t)))return {intent:null,confidence:0,reason:'multiple_commands'};
    const ranked=catalog.intents.filter(i=>i.groups.every(group=>group.some(c=>conceptPresent(c,tokens)))).map(i=>({intent:i.name,confidence:Math.max(...i.phrases.map(p=>similarity(value,normalize(p))))})).sort((a,b)=>b.confidence-a.confidence||a.intent.localeCompare(b.intent));
    if(!ranked.length)return {intent:null,confidence:0,reason:'unknown_intent'};
    const best=ranked[0],confidence=Math.round(best.confidence*1000)/1000;
    if(best.confidence<catalog.threshold)return {intent:null,confidence,reason:'low_confidence'};
    if(ranked[1]&&best.confidence-ranked[1].confidence<catalog.margin)return {intent:null,confidence,reason:'ambiguous',alternatives:ranked.slice(0,2).map(i=>i.intent)};
    return {...best,confidence,reason:'matched'};
  }
  function fallback(text,events,now=new Date()){
    const match=classify(text),base={intent:match.intent,confidence:match.confidence,engine:'browser'};
    if(!match.intent)return {...base,action:'clarify',screen:null,params:{reason:match.reason},message:'Não tenho certeza do pedido. Diga uma ação de cada vez.'};
    if(match.intent.startsWith('INTENT_EVENTOS_')||match.intent==='INTENT_PROXIMO_EVENTO'){
      let selected=[];
      if(match.intent==='INTENT_PROXIMO_EVENTO'){
        const future=events.filter(e=>Number.isFinite(Date.parse(e.startsAt))&&Date.parse(e.startsAt)>=now.getTime()).sort((a,b)=>Date.parse(a.startsAt)-Date.parse(b.startsAt));
        selected=future.length?future.filter(e=>Date.parse(e.startsAt)===Date.parse(future[0].startsAt)):[];
      }else{
        const target=new Date(now);if(match.intent==='INTENT_EVENTOS_AMANHA')target.setDate(target.getDate()+1);
        selected=events.filter(e=>{const d=new Date(e.startsAt);return d.getFullYear()===target.getFullYear()&&d.getMonth()===target.getMonth()&&d.getDate()===target.getDate();});
      }
      if(!selected.length)return {...base,action:'inform',screen:null,params:{},message:match.intent==='INTENT_PROXIMO_EVENTO'?'Você não possui eventos futuros.':`Você não possui eventos ${match.intent==='INTENT_EVENTOS_AMANHA'?'amanhã':'hoje'}.`};
      if(selected.length>1)return {...base,action:'choose',screen:'eventos',params:{eventos:selected.map(e=>({evento_id:e.id}))},message:'Encontrei mais de um evento. Qual deseja abrir?'};
      return {...base,action:'navigate',screen:'detalhes_evento',params:{evento_id:selected[0].id},message:'Abrindo o evento solicitado.'};
    }
    const controls=['iniciar','ligar','ligue','liga','ativar','ative','ativa','parar','pare','pausar','interromper','desligar','bpm'];
    if(normalize(text).split(' ').some(t=>controls.includes(t)))return {...base,action:'clarify',screen:null,params:{reason:'unsupported_operation'},message:'Este módulo reconhece abrir a ferramenta, não seus controles internos.'};
    return {...base,action:'navigate',screen:screens[match.intent],params:{},message:'Abrindo a tela solicitada.'};
  }
  function valid(body,events,expectedIntent){
    if(!body||body.intent!==expectedIntent||!Number.isFinite(body.confidence)||body.confidence<catalog.threshold||body.confidence>1||typeof body.message!=='string'||body.message.length>500||!body.params||typeof body.params!=='object')return false;
    const ids=new Set(events.map(e=>e.id));
    if(body.action==='inform'||body.action==='clarify')return body.screen===null;
    if(body.action==='choose')return screens[body.intent]==='detalhes_evento'&&body.screen==='eventos'&&Array.isArray(body.params.eventos)&&body.params.eventos.length>1&&body.params.eventos.every(e=>ids.has(e.evento_id));
    return body.action==='navigate'&&body.screen===screens[body.intent]&&(body.screen!=='detalhes_evento'||ids.has(body.params.evento_id));
  }
  async function resolve(text,events){
    const local=fallback(text,events);if(!local.intent||global.navigator?.onLine===false||events.length>250||typeof global.fetch!=='function')return local;
    const localPreview=['127.0.0.1','localhost'].includes(global.location?.hostname)&&global.location?.port==='4173';
    const base=global.apiConfig?.API_BASE_URL;const url=localPreview?'/api/assistant/resolve':base?String(base).replace(/\/$/,'')+'/api/assistant/resolve':null;
    if(!url)return local;
    const controller=new AbortController(),timer=global.setTimeout(()=>controller.abort(),2000);
    try{
      const response=await global.fetch(url,{method:'POST',credentials:'omit',cache:'no-store',signal:controller.signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({text,events,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone})});
      if(!response.ok)return local;const body=await response.json();return valid(body,events,local.intent)?{...body,engine:'python'}:local;
    }catch(_error){return local;}finally{global.clearTimeout(timer);}
  }
  global.roudyIntentClient=Object.freeze({classify,resolve,fallback,normalize});
})(window);
