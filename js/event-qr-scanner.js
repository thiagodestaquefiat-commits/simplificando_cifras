(function(global){
  'use strict';
  let stream=null,frame=0,detector=null,eventId=null,inviteRole='Outra',busy=false,lastScan=0,generation=0,decoding=false,fileBusy=false;
  const byId=id=>global.document?.getElementById(id);
  function extractIdentity(raw){
    const value=String(raw||'').trim();if(!value)return'';
    const direct=value.match(/^roudy:(?:\/\/)?(?:profile|user)[:/](.+)$/i);if(direct){try{const id=decodeURIComponent(direct[1]).trim();return /^[A-Za-z0-9_.:@-]{2,120}$/.test(id)?id:'';}catch(_error){return'';}}
    try{
      const url=new URL(value);if(!['https:','http:'].includes(url.protocol))return'';const hash=new URLSearchParams(url.hash.replace(/^#/,''));
      const candidate=url.searchParams.get('userId')||url.searchParams.get('user')||url.searchParams.get('profile')||hash.get('userId')||hash.get('user')||hash.get('profile');
      if(candidate)return candidate.trim();
      const path=url.pathname.match(/\/(?:profile|user)\/([^/?#]+)/i);if(path)return decodeURIComponent(path[1]).trim();
    }catch(_error){}
    return /^@[A-Za-z0-9_.-]{2,64}$/.test(value)||/^[A-Za-z0-9_.:-]{3,120}$/.test(value)?value:'';
  }
  function ensureLayer(){
    let layer=byId('event-qr-scanner');if(layer)return layer;
    layer=global.document.createElement('section');layer.id='event-qr-scanner';layer.className='event-qr-scanner roudy-stage-scanner';layer.hidden=true;
    layer.innerHTML=`<header class="event-qr-header"><button type="button" class="event-qr-close roudy-stage-close" aria-label="Fechar leitor de QR"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></header><main class="event-qr-viewfinder"><video id="event-qr-video" playsinline muted aria-label="Imagem da câmera para leitura do QR Code"></video><canvas id="event-qr-canvas" hidden></canvas><div class="roudy-stage-wash" aria-hidden="true"></div><div class="roudy-stage-content"><div class="event-qr-shade" aria-hidden="true"><i><svg class="roudy-stage-check" viewBox="0 0 24 24"><path d="m5 12 4 4 10-10"/></svg></i></div><svg class="roudy-stage-indicator" viewBox="0 0 64 32" aria-hidden="true"><path d="M8 3v26M19 9v14M30 13v6M41 14v4M52 14v4"/></svg><p id="event-qr-status" role="status" aria-live="polite">Aponte a câmera para o QR Code do ROUDY.</p><label class="event-qr-gallery roudy-stage-gallery" role="button" tabindex="0"><input id="event-qr-file" type="file" accept="image/*" hidden>Selecionar da galeria</label></div></main><footer class="event-qr-controls"><button type="button" id="event-qr-torch" aria-label="Ligar ou desligar lanterna" disabled hidden><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6l-1 7 3 3-4 8h-2l-4-8 3-3 0-7M9 10h6"/></svg></button></footer>`;
    global.document.body.appendChild(layer);
    layer.querySelector('.roudy-stage-gallery').addEventListener('keydown',event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();byId('event-qr-file').click();}});
    layer.querySelector('.event-qr-close').addEventListener('click',close);
    byId('event-qr-torch').addEventListener('click',toggleTorch);
    byId('event-qr-file').addEventListener('change',scanFile);
    return layer;
  }
  function status(message){const target=byId('event-qr-status');if(target)target.textContent=message;}
  async function createDetector(){if('BarcodeDetector'in global){try{const formats=await global.BarcodeDetector.getSupportedFormats?.();if(!formats||formats.includes('qr_code'))return new global.BarcodeDetector({formats:['qr_code']});}catch(_error){}}try{await global.roudyQrLibs?.reader();}catch(_error){}if(typeof global.jsQR==='function')return null;throw new Error('A leitura de QR Code não está disponível neste dispositivo.');}
  async function readQr(source,width,height){if(detector){const codes=await detector.detect(source);return codes[0]?.rawValue||'';}const canvas=byId('event-qr-canvas'),context=canvas?.getContext('2d',{willReadFrequently:true});if(!context||!width||!height||typeof global.jsQR!=='function')return'';const scale=Math.min(1,960/Math.max(width,height));canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));context.drawImage(source,0,0,canvas.width,canvas.height);const image=context.getImageData(0,0,canvas.width,canvas.height);return global.jsQR(image.data,canvas.width,canvas.height,{inversionAttempts:'attemptBoth'})?.data||'';}
  let identityHandler=null;
  async function open(id,options={}){
    stop();const current=generation;identityHandler=typeof options.onIdentity==='function'?options.onIdentity:null;
    eventId=String(id);inviteRole=String(options.role||'Outra');busy=false;fileBusy=false;lastScan=0;const layer=ensureLayer();layer.classList.remove('is-read');layer.hidden=false;global.document.body.classList.add('event-qr-open');status('Aponte a câmera para o QR Code do ROUDY.');layer.querySelector('.event-qr-close').focus({preventScroll:true});
    try{detector=await createDetector();if(current!==generation)return;if(!navigator.mediaDevices?.getUserMedia)throw new Error('A câmera não está disponível. Selecione uma imagem da galeria.');const opened=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});if(current!==generation){opened.getTracks().forEach(track=>track.stop());return;}stream=opened;const video=byId('event-qr-video');video.srcObject=stream;await video.play();if(current!==generation)return;configureTorch();scanLoop();}
    catch(error){if(current!==generation)return;stop();status(error?.name==='NotAllowedError'?'A câmera não foi autorizada. Libere o acesso ou selecione uma imagem da galeria.':error.message||'Não foi possível iniciar a câmera.');}
  }
  function stop(){generation++;if(frame)cancelAnimationFrame(frame);frame=0;if(stream){stream.getTracks().forEach(track=>track.stop());stream=null;}const video=byId('event-qr-video');if(video)video.srcObject=null;}
  function close(){stop();const layer=byId('event-qr-scanner');if(layer)layer.hidden=true;global.document?.body.classList.remove('event-qr-open');eventId=null;busy=false;fileBusy=false;}
  async function scanLoop(time=0){if(!stream||busy)return;frame=requestAnimationFrame(scanLoop);if(decoding||fileBusy||time-lastScan<220)return;lastScan=time;const video=byId('event-qr-video');if(!video||video.readyState<2)return;decoding=true;const current=generation;try{const raw=await readQr(video,video.videoWidth,video.videoHeight);if(current===generation&&raw)await handle(raw);}catch(_error){}finally{decoding=false;}}
  async function handle(raw){
    if(busy)return;const identity=extractIdentity(raw);if(!identity){status('Este QR Code não contém um perfil ROUDY válido.');return;}busy=true;const current=generation,handler=identityHandler,id=eventId,role=inviteRole;status('Verificando perfil…');
    try{const user=handler?await handler(identity):await global.eventUserInvites.inviteScanned(id,identity,role);if(current!==generation)return;byId('event-qr-scanner').classList.add('is-read');status('QR Code reconhecido.');await new Promise(resolve=>setTimeout(resolve,300));if(current!==generation)return;close();global.showToast?.(`Convite enviado para ${user.name}.`);}
    catch(error){if(current===generation){busy=false;status(error?.message||'Não foi possível convidar este perfil.');scanLoop();}}
  }
  function configureTorch(){const button=byId('event-qr-torch'),track=stream?.getVideoTracks?.()[0],supported=Boolean(track?.getCapabilities?.().torch);if(button){button.disabled=!supported;button.hidden=!supported;button.setAttribute('aria-pressed','false');}}
  async function toggleTorch(){const track=stream?.getVideoTracks?.()[0],button=byId('event-qr-torch');if(!track||button?.disabled)return;const active=button.getAttribute('aria-pressed')==='true';try{await track.applyConstraints({advanced:[{torch:!active}]});button.setAttribute('aria-pressed',String(!active));}catch(_error){status('A lanterna não está disponível neste dispositivo.');}}
  async function scanFile(event){const file=event.target.files?.[0];event.target.value='';if(!file||busy||fileBusy)return;fileBusy=true;const current=generation;let bitmap;try{detector=await createDetector();if(current!==generation)return;bitmap=await createImageBitmap(file);const raw=await readQr(bitmap,bitmap.width,bitmap.height);if(current!==generation)return;if(!raw)throw new Error('Nenhum QR Code foi encontrado nessa imagem.');await handle(raw);}catch(error){if(current===generation)status(error.message||'Não foi possível ler essa imagem.');}finally{bitmap?.close?.();fileBusy=false;}}
  global.document?.addEventListener('keydown',event=>{if(event.key==='Escape'&&!byId('event-qr-scanner')?.hidden&&byId('event-qr-scanner')){event.preventDefault();close();}});
  global.addEventListener?.('pagehide',close);
  global.eventQrScanner=Object.freeze({open,close,extractIdentity});
  if(typeof module!=='undefined'&&module.exports)module.exports={extractIdentity};
})(typeof window!=='undefined'?window:globalThis);
