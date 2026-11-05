// Private voice notes: no audio/base64 in localStorage, JWTs or public URLs.
(function(global){
  'use strict';
  const icons={play:'<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" stroke="none" d="M6 3v18l15-9Z"/></svg>',pause:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9 8v8m6-8v8"/></svg>',send:'<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" stroke="none" d="M3 3 22 12 3 21l3-8 10-1-10-1Z"/></svg>',trash:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m-9 0 1 14h10l1-14M10 11v6m4-6v6"/></svg>'};
  const formatTime=value=>Math.floor(Math.max(0,value)/60)+':'+String(Math.floor(Math.max(0,value))%60).padStart(2,'0');
  function waveImage(values){return `url("data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 28" preserveAspectRatio="none">'+values.map((v,i)=>{const h=Math.max(2,Math.min(26,v*26));return `<rect x="${i*4}" y="${(28-h)/2}" width="2" height="${h}" rx="1" fill="white" fill-opacity=".6"/>`}).join('')+'</svg>')}")`;}
  function captureMeter(state){try{const Context=global.AudioContext||global.webkitAudioContext;if(!Context)return;state.audioContext=new Context();state.analyser=state.audioContext.createAnalyser();state.analyser.fftSize=256;state.source=state.audioContext.createMediaStreamSource(state.stream);state.source.connect(state.analyser);state.samples=new Uint8Array(256);state.levels=Array(40).fill(0);state.audioContext.resume().catch(()=>{});}catch(_){}}
  function updateMeter(state){if(!state.analyser||!state.samples||state.recorder?.state!=='recording')return;state.analyser.getByteTimeDomainData(state.samples);const rms=Math.sqrt(state.samples.reduce((sum,n)=>sum+((n-128)/128)**2,0)/state.samples.length);state.levels.push(Math.min(1,rms*5));state.levels.shift();status.style.setProperty('--voice-wave',waveImage(state.levels));}
  const MAX=3*1024*1024,SECONDS=90;
  let options,button,status,retry,discard,pauseControl,tools,recording=null,busy=false,finalizing=false,dbPromise,screenScope='',playGeneration=0;
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
  function release(state){state.source?.disconnect();state.audioContext?.close().catch(()=>{});status?.style.removeProperty('--voice-wave');clearInterval(state.clock);clearTimeout(state.limit);state.stream?.getTracks().forEach(track=>track.stop());button?.classList.remove('is-recording');tools?.classList.remove('is-recording','is-holding');if(pauseControl)pauseControl.hidden=true;}
  function stop(cancelled=false){
    const state=recording;if(!state)return;recording=null;state.cancelled=cancelled||!same(state.scope);
    if(state.recorder&&state.recorder.state!=='inactive')state.recorder.stop();else{release(state);notice('');}
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
    busy=true;let failure='';button.disabled=retry.disabled=discard.disabled=true;tools.classList.add('is-sending');notice('');
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
    finally{busy=false;tools.classList.remove('is-sending');retry.disabled=discard.disabled=false;if(same(current)){await refresh();if(failure)notice(failure);}}
  }
  async function begin(event){
    if(event.button!=null&&event.button!==0||recording||busy||finalizing)return;
    event.preventDefault();
    const current=scope();if(!current||!active()){global.showToast('Entre na sua conta para enviar áudio.');return;}
    const state={scope:current,x:event.clientX||0,y:event.clientY||0,cancelled:false,chunks:[],bytes:0,locked:event.type==='keydown',pointerId:event.pointerId};recording=state;if(event.pointerId!=null)button.setPointerCapture?.(event.pointerId);
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
        const duration=(performance.now()-state.started-(state.pausedMs||0)-(state.pausedAt?performance.now()-state.pausedAt:0))/1000,blob=new Blob(state.chunks,{type:recorder.mimeType});
        if(duration<.4||!blob.size||blob.size>MAX){notice('Gravação muito curta ou maior que o limite.');return;}
        finalizing=true;
        try{await draft('put',current.key,{id:crypto.randomUUID(),blob});if(same(current)){await refresh();if(state.sendAfter)await send();}}
        catch(error){if(same(current))notice(error.message);}
        finally{finalizing=false;}
      };
      captureMeter(state);recorder.start(250);button.classList.add('is-recording');tools.classList.add('is-recording');tools.classList.toggle('is-holding',!state.locked);pauseControl.hidden=false;retry.hidden=discard.hidden=false;pauseControl.innerHTML=icons.pause;pauseControl.setAttribute('aria-label','Pausar gravação');
      const tick=()=>{updateMeter(state);if(!same(current)){stop(true);return;}notice(formatTime((performance.now()-state.started-(state.pausedMs||0)-(state.pausedAt?performance.now()-state.pausedAt:0))/1000));};tick();state.clock=setInterval(tick,500);state.limit=setTimeout(()=>stop(),SECONDS*1000);
    }catch(error){if(recording===state)recording=null;release(state);if(same(current))notice(error.name==='NotAllowedError'?'Permita o microfone para gravar áudio.':error.message);}
  }
  function render(bubble,message){
    const cached=rendered.get(String(message.id));if(cached){bubble.appendChild(cached.box);return;}
    const box=document.createElement('div');box.className='event-audio-message';
    const avatar=document.createElement('span');avatar.className='event-audio-avatar';avatar.textContent=String(message.sender?.name||'?').slice(0,1);
    const photo=String(message.sender?.avatarUrl||'');if(/^(https?:|data:image\/|blob:)/i.test(photo)){const image=document.createElement('img');image.src=photo;image.alt='';image.onerror=()=>image.remove();avatar.append(image);}
    const mic=document.createElement('span');mic.className='event-audio-avatar-mic';mic.setAttribute('aria-hidden','true');mic.innerHTML='<svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M6 11a6 6 0 0 0 12 0M12 17v4m-3 0h6"/></svg>';avatar.append(mic);
    const play=document.createElement('button');play.type='button';play.className='event-audio-play';play.innerHTML=icons.play;play.setAttribute('aria-label','Reproduzir mensagem de áudio');
    const progress=document.createElement('input');progress.type='range';progress.className='event-audio-progress';progress.min='0';progress.max=String(message.audio?.duration||message.poll?.duration||1);progress.step='.1';progress.value='0';progress.disabled=true;progress.setAttribute('aria-label','Posição do áudio');
    const label=document.createElement('span');label.className='event-audio-duration';label.textContent=formatTime(message.audio?.duration||message.poll?.duration||0);
    const player=document.createElement('audio');player.preload='none';player.hidden=true;player.setAttribute('aria-label','Mensagem de áudio de '+message.sender.name);
    play.onclick=async()=>{
      const current=scope(),generation=playGeneration;if(!current||String(message.eventId)!==current.event)return;
      if(player.src){if(player.paused){try{await player.play();}catch(error){notice(error.message);}}else player.pause();return;}
      play.disabled=true;
      try{
        const response=await fetch(global.apiConfig.collaborationEndpoint('/events/'+encodeURIComponent(message.eventId)+'/messages/'+encodeURIComponent(message.id)+'/audio'),{headers:{Authorization:'Bearer '+global.appAuth.getAccessToken()},cache:'no-store'});
        if(!response.ok)throw new Error('Áudio indisponível ou sem permissão.');const blob=await response.blob();
        if(!same(current)||generation!==playGeneration||!box.isConnected)return;
        const url=URL.createObjectURL(blob);urls.add(url);player.src=url;players.add(player);await player.play();
        const Context=global.AudioContext||global.webkitAudioContext;if(Context){const decoder=new Context();try{const decoded=await decoder.decodeAudioData(await blob.arrayBuffer());if(same(current)&&generation===playGeneration&&box.isConnected){const data=decoded.getChannelData(0),step=Math.max(1,Math.floor(data.length/40)),values=[];for(let i=0;i<40;i++){let sum=0,count=0;for(let j=i*step;j<Math.min(data.length,(i+1)*step);j+=8){sum+=data[j]*data[j];count++;}values.push(Math.min(1,Math.sqrt(sum/Math.max(1,count))*5));}progress.style.backgroundImage=waveImage(values);progress.style.backgroundSize='100% 28px';progress.style.backgroundRepeat='no-repeat';progress.max=String(decoded.duration);progress.disabled=false;if(!player.currentTime)label.textContent=formatTime(decoded.duration);}}catch(_){}finally{decoder.close().catch(()=>{});}}
      }catch(error){if(same(current))global.showToast(error.message);}finally{play.disabled=false;}
    };
    player.onplay=()=>{players.forEach(other=>{if(other!==player)other.pause();});play.innerHTML=icons.pause;play.setAttribute('aria-label','Pausar mensagem de áudio');};
    player.onpause=player.onended=()=>{play.innerHTML=icons.play;play.setAttribute('aria-label','Reproduzir mensagem de áudio');};
    player.onloadedmetadata=()=>{if(Number.isFinite(player.duration)){progress.max=String(player.duration);progress.disabled=false;label.textContent=formatTime(player.duration);}};
    player.ontimeupdate=()=>{progress.value=String(player.currentTime);label.textContent=formatTime(player.currentTime||Number(progress.max)||message.audio?.duration||message.poll?.duration||0);};
    progress.oninput=()=>{if(Number.isFinite(player.duration))player.currentTime=Math.min(player.duration,Number(progress.value));};
    box.append(avatar,play,progress,label,player);bubble.appendChild(box);rendered.set(String(message.id),{box,player});
  }
  function initialize(value){
    options=value;const composer=document.querySelector('.event-chat-composer');
    button=document.createElement('button');button.type='button';button.className='event-chat-mic';button.setAttribute('aria-label','Gravar áudio');button.title='Segure para gravar; deslize para cancelar ou arraste para cima para travar';button.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M6 11a6 6 0 0 0 12 0M12 17v4m-3 0h6"/></svg>';composer.appendChild(button);
    tools=document.createElement('div');tools.className='event-audio-tools';status=document.createElement('span');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
    retry=document.createElement('button');retry.type='button';retry.innerHTML=icons.send;retry.setAttribute('aria-label','Enviar áudio');retry.hidden=true;retry.onclick=()=>{if(recording){recording.sendAfter=true;stop();}else send();};
    discard=document.createElement('button');discard.type='button';discard.innerHTML=icons.trash;discard.setAttribute('aria-label','Descartar');discard.hidden=true;discard.onclick=async()=>{if(recording){stop(true);retry.hidden=discard.hidden=true;notice('');return;}const current=scope();if(!current||busy)return;try{await draft('delete',current.key);if(same(current)){notice('');await refresh();}}catch(error){if(same(current))notice(error.message);}};pauseControl=document.createElement('button');pauseControl.type='button';pauseControl.className='event-audio-pause';pauseControl.hidden=true;pauseControl.onclick=()=>{const state=recording;if(!state?.recorder)return;if(state.recorder.state==='recording'){state.recorder.pause();state.pausedAt=performance.now();pauseControl.innerHTML=icons.play;pauseControl.setAttribute('aria-label','Retomar gravação');}else if(state.recorder.state==='paused'){state.recorder.resume();state.pausedMs=(state.pausedMs||0)+performance.now()-state.pausedAt;state.pausedAt=null;pauseControl.innerHTML=icons.pause;pauseControl.setAttribute('aria-label','Pausar gravação');}};const hint=document.createElement('span');hint.className='event-audio-hold-hint';hint.textContent='Deslize para cancelar ‹';const lock=document.createElement('span');lock.className='event-audio-lock-hint';lock.setAttribute('aria-hidden','true');lock.innerHTML='<svg viewBox="0 0 24 24"><rect x="6" y="10" width="12" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M7 7l5-5 5 5"/></svg>';tools.append(status,discard,pauseControl,retry,hint,lock);composer.before(tools);
    // Preview 123 uses an absolute composer above the attachment tray. Reserve
    // recording/retry space in that same geometry, including keyboard resizes.
    const chat=document.getElementById('event-chat-view');
    const measure=()=>{
      chat.style.setProperty('--event-chat-composer-height',composer.getBoundingClientRect().height+'px');
      const height=tools.getBoundingClientRect().height;
      chat.style.setProperty('--event-chat-audio-tools-height',height+'px');
      chat.classList.toggle('has-audio-status',height>0);
    };
    const geometry=new ResizeObserver(measure);geometry.observe(composer);geometry.observe(tools);
    button.onpointerdown=begin;button.oncontextmenu=e=>e.preventDefault();
    // Recording remains open until the explicit send/discard action.
    document.addEventListener('pointerup',e=>{if(recording&&!recording.locked&&(recording.pointerId==null||e.pointerId===recording.pointerId)){recording.sendAfter=true;stop();}});
    document.addEventListener('pointercancel',e=>{if(recording&&!recording.locked&&e.pointerId===recording.pointerId)stop(true);});
    document.addEventListener('pointermove',e=>{const state=recording;if(!state||state.locked||e.pointerId!==state.pointerId)return;const left=state.x-e.clientX,up=state.y-e.clientY;if(up>=90&&up>left){state.locked=true;tools.classList.remove('is-holding');notice(formatTime((performance.now()-state.started-(state.pausedMs||0))/1000));}else if(left>=70&&left>=up){retry.hidden=discard.hidden=true;stop(true);}});
    button.onkeydown=e=>{if((e.key===' '||e.key==='Enter')&&!e.repeat)begin(e);if(e.key==='Escape')stop(true);};button.onkeyup=e=>{if(e.key===' '||e.key==='Enter')e.preventDefault();};
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
