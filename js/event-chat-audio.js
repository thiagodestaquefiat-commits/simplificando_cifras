// Private voice notes: no audio/base64 in localStorage, JWTs or public URLs.
(function(global){
  'use strict';
  const MAX=3*1024*1024,SECONDS=90;
  let options,button,status,retry,discard,recording=null,busy=false,finalizing=false,dbPromise,screenScope='',playGeneration=0;
  const players=new Set(),urls=new Set(),rendered=new Map();
  const auth=()=>global.appAuth?.getState?.();
  const scope=()=>{const event=options?.getEvent(),user=auth()?.user;return auth()?.authenticated&&event&&user?{owner:String(user.id),event:String(event.id),key:String(user.id)+'|'+String(event.id)}:null;};
  const active=()=>!document.getElementById('event-chat-view')?.hidden;
  const same=value=>active()&&scope()?.key===value?.key;
  const notice=text=>{if(status)status.textContent=text;};
  function database(){
    if(!dbPromise)dbPromise=new Promise((resolve,reject)=>{const req=indexedDB.open('roudy-chat-audio-v1',1);req.onupgradeneeded=()=>req.result.createObjectStore('drafts');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(new Error('Armazenamento indisponível. Não foi possível preservar o áudio.'));});
    return dbPromise;
  }
  async function draft(action,key,value){
    const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction('drafts',action==='get'?'readonly':'readwrite'),store=tx.objectStore('drafts');const req=action==='get'?store.get(key):action==='put'?store.put(value,key):store.delete(key);tx.oncomplete=()=>resolve(req.result);tx.onerror=tx.onabort=()=>reject(new Error('Não foi possível guardar a gravação neste aparelho.'));});
  }
  function release(state){clearInterval(state.clock);clearTimeout(state.limit);state.stream?.getTracks().forEach(track=>track.stop());button?.classList.remove('is-recording');}
  function stop(cancelled=false){
    const state=recording;if(!state)return;recording=null;state.cancelled=cancelled||!same(state.scope);
    if(state.recorder?.state==='recording')state.recorder.stop();else{release(state);notice('');}
  }
  function stopPlayback(){++playGeneration;players.forEach(player=>{player.pause();player.removeAttribute('src');player.load();});players.clear();urls.forEach(url=>URL.revokeObjectURL(url));urls.clear();rendered.clear();}
  function syncMessages(messages){
    const allowed=new Set(messages.filter(m=>m.type==='audio'&&!m.deleted).map(m=>String(m.id)));
    rendered.forEach((entry,id)=>{if(!allowed.has(id)){entry.player.pause();players.delete(entry.player);const url=entry.player.src;if(url.startsWith('blob:')){URL.revokeObjectURL(url);urls.delete(url);}entry.player.removeAttribute('src');entry.player.load();entry.box.remove();rendered.delete(id);}});
  }
  async function refresh(){
    const current=scope();if(!current||!active())return;
    try{const saved=await draft('get',current.key);if(!same(current))return;retry.hidden=discard.hidden=!saved;button.disabled=!!saved||busy;
      if(saved)notice('Áudio salvo neste aparelho. Envie ou descarte antes de gravar outro.');
    }catch(error){if(same(current)){button.disabled=true;notice(error.message);}}
  }
  async function send(){
    const current=scope();if(busy||!current||!same(current))return;
    busy=true;let failure='';button.disabled=retry.disabled=discard.disabled=true;notice('Enviando áudio…');
    try{
      const saved=await draft('get',current.key);if(!saved||!same(current))return;
      const token=global.appAuth.getAccessToken(),form=new FormData();form.append('clientId',saved.id);form.append('audio',saved.blob,'gravacao');
      const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),30000);
      let response;try{response=await fetch(global.apiConfig.collaborationEndpoint('/events/'+encodeURIComponent(current.event)+'/messages/audio'),{method:'POST',headers:{Authorization:'Bearer '+token},body:form,signal:controller.signal});}finally{clearTimeout(timeout);}
      const body=await response.json();if(!response.ok)throw new Error(body?.erro?.mensagem||'Não foi possível enviar o áudio.');
      // Idempotent client ID makes retries safe even if the first response was lost.
      await draft('delete',current.key);
      if(same(current)){options.onMessage(body);notice('');}
    }catch(error){failure=(error.name==='AbortError'?'O envio demorou demais.':error.message)+' A gravação foi preservada; tente enviar novamente.';}
    finally{busy=false;retry.disabled=discard.disabled=false;if(same(current)){await refresh();if(failure)notice(failure);}}
  }
  async function begin(event){
    if(event.button!=null&&event.button!==0||recording||busy||finalizing)return;
    event.preventDefault();
    const current=scope();if(!current||!active()){global.showToast('Entre na sua conta para enviar áudio.');return;}
    const state={scope:current,x:event.clientX||0,y:event.clientY||0,cancelled:false,chunks:[],bytes:0};recording=state;
    try{
      if(!global.isSecureContext||!navigator.mediaDevices?.getUserMedia||!global.MediaRecorder)throw new Error('Gravação indisponível. Use um navegador atualizado em HTTPS.');
      if(await draft('get',current.key)){stop(true);await refresh();return;}
      const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:false});state.stream=stream;
      if(recording!==state||!same(current)){release(state);return;}
      const mime=['audio/mp4','audio/webm;codecs=opus','audio/ogg;codecs=opus'].find(type=>MediaRecorder.isTypeSupported(type));
      const recorder=new MediaRecorder(stream,{...(mime?{mimeType:mime}:{}),audioBitsPerSecond:64000});state.recorder=recorder;state.started=performance.now();
      recorder.ondataavailable=e=>{if(e.data.size){state.chunks.push(e.data);state.bytes+=e.data.size;if(state.bytes>MAX){notice('Limite de tamanho excedido. Gravação descartada.');stop(true);}}};
      recorder.onerror=()=>{stop(true);notice('Falha ao gravar. Tente novamente.');};
      recorder.onstop=async()=>{
        release(state);if(!same(current))return;if(state.cancelled){notice('Gravação cancelada.');return;}
        const duration=(performance.now()-state.started)/1000,blob=new Blob(state.chunks,{type:recorder.mimeType});
        if(duration<.4||!blob.size||blob.size>MAX){notice('Gravação muito curta ou maior que o limite.');return;}
        finalizing=true;
        try{await draft('put',current.key,{id:crypto.randomUUID(),blob});if(same(current)){await refresh();await send();}}
        catch(error){if(same(current))notice(error.message);}
        finally{finalizing=false;}
      };
      recorder.start(250);button.classList.add('is-recording');
      const tick=()=>{if(!same(current)){stop(true);return;}notice('Gravando '+Math.floor((performance.now()-state.started)/1000)+'s · solte para enviar · arraste para cancelar');};tick();state.clock=setInterval(tick,500);state.limit=setTimeout(()=>stop(),SECONDS*1000);
    }catch(error){if(recording===state)recording=null;release(state);if(same(current))notice(error.name==='NotAllowedError'?'Permita o microfone para gravar áudio.':error.message);}
  }
  function render(bubble,message){
    const cached=rendered.get(String(message.id));if(cached){bubble.appendChild(cached.box);return;}
    const box=document.createElement('div');box.className='event-audio-message';
    const play=document.createElement('button');play.type='button';play.className='event-audio-play';play.textContent='▶';play.setAttribute('aria-label','Reproduzir mensagem de áudio');
    const wave=document.createElement('span');wave.className='event-audio-wave';wave.setAttribute('aria-hidden','true');wave.textContent='▂▅▃▇▅▂▆▃▅▇▂▅▃';
    const label=document.createElement('span');label.className='event-audio-duration';const seconds=Math.round(message.audio?.duration||0);label.textContent=Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');
    const player=document.createElement('audio');player.controls=true;player.preload='none';player.hidden=true;player.setAttribute('aria-label','Mensagem de áudio de '+message.sender.name);
    play.onclick=async()=>{
      const current=scope(),generation=playGeneration;if(!current||String(message.eventId)!==current.event)return;
      play.disabled=true;
      try{
        const response=await fetch(global.apiConfig.collaborationEndpoint('/events/'+encodeURIComponent(message.eventId)+'/messages/'+encodeURIComponent(message.id)+'/audio'),{headers:{Authorization:'Bearer '+global.appAuth.getAccessToken()},cache:'no-store'});
        if(!response.ok)throw new Error('Áudio indisponível ou sem permissão.');const blob=await response.blob();
        if(!same(current)||generation!==playGeneration||!box.isConnected)return;
        const url=URL.createObjectURL(blob);urls.add(url);player.src=url;player.hidden=false;play.hidden=wave.hidden=true;players.add(player);await player.play();
      }catch(error){if(same(current))global.showToast(error.message);}finally{play.disabled=false;}
    };
    player.onplay=()=>players.forEach(other=>{if(other!==player)other.pause();});box.append(play,wave,label,player);bubble.appendChild(box);rendered.set(String(message.id),{box,player});
  }
  function initialize(value){
    options=value;const composer=document.querySelector('.event-chat-composer');
    button=document.createElement('button');button.type='button';button.className='event-chat-mic';button.setAttribute('aria-label','Segure para gravar áudio');button.title='Segure para gravar; solte para enviar';button.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M6 11a6 6 0 0 0 12 0M12 17v4m-3 0h6"/></svg>';composer.appendChild(button);
    const tools=document.createElement('div');tools.className='event-audio-tools';status=document.createElement('span');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
    retry=document.createElement('button');retry.type='button';retry.textContent='Enviar áudio';retry.hidden=true;retry.onclick=send;
    discard=document.createElement('button');discard.type='button';discard.textContent='Descartar';discard.hidden=true;discard.onclick=async()=>{const current=scope();if(!current||busy)return;try{await draft('delete',current.key);if(same(current)){notice('');await refresh();}}catch(error){if(same(current))notice(error.message);}};tools.append(status,retry,discard);composer.before(tools);
    button.onpointerdown=begin;button.oncontextmenu=e=>e.preventDefault();
    document.addEventListener('pointerup',()=>stop());document.addEventListener('pointercancel',()=>stop(true));
    document.addEventListener('pointermove',e=>{if(recording&&(e.clientX<recording.x-70||e.clientY<recording.y-90))stop(true);});
    button.onkeydown=e=>{if((e.key===' '||e.key==='Enter')&&!e.repeat)begin(e);if(e.key==='Escape')stop(true);};button.onkeyup=e=>{if(e.key===' '||e.key==='Enter')stop();};
    const input=document.getElementById('event-chat-input'),textSend=composer.querySelector('.event-chat-send');const update=()=>{button.hidden=!!input.value.trim();textSend.hidden=!button.hidden;};input.addEventListener('input',update);update();
    new MutationObserver(()=>{
      const next=active()?scope()?.key||'':'';
      if(next!==screenScope){screenScope=next;stop(true);stopPlayback();notice('');if(next)refresh();}
    }).observe(document.getElementById('event-chat-view'),{attributes:true,attributeFilter:['hidden']});
    global.appAuth?.subscribe?.(()=>{stop(true);stopPlayback();notice('');if(active())refresh();});
    document.addEventListener('visibilitychange',()=>{if(document.hidden){stop(true);stopPlayback();}});
    global.addEventListener('pagehide',()=>{stop(true);stopPlayback();});
    global.addEventListener('blur',()=>{stop(true);stopPlayback();});
  }
  global.eventChatAudio=Object.freeze({initialize,render,syncMessages,cancel(){stop(true);stopPlayback();},refresh});
})(window);
