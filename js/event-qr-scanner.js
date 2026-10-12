(function(global){
  'use strict';
  let stream=null,frame=0,detector=null,eventId=null,busy=false,lastScan=0;
  const byId=id=>global.document?.getElementById(id);
  function extractIdentity(raw){
    const value=String(raw||'').trim();if(!value)return'';
    const direct=value.match(/^roudy:(?:\/\/)?(?:profile|user)[:/](.+)$/i);if(direct)return decodeURIComponent(direct[1]).trim();
    try{
      const url=new URL(value),hash=new URLSearchParams(url.hash.replace(/^#/,''));
      const candidate=url.searchParams.get('userId')||url.searchParams.get('user')||url.searchParams.get('profile')||hash.get('userId')||hash.get('user')||hash.get('profile');
      if(candidate)return candidate.trim();
      const path=url.pathname.match(/\/(?:profile|user)\/([^/?#]+)/i);if(path)return decodeURIComponent(path[1]).trim();
    }catch(_error){}
    return /^@[A-Za-z0-9_.-]{2,64}$/.test(value)||/^[A-Za-z0-9_.:-]{3,120}$/.test(value)?value:'';
  }
  function ensureLayer(){
    let layer=byId('event-qr-scanner');if(layer)return layer;
    layer=global.document.createElement('section');layer.id='event-qr-scanner';layer.className='event-qr-scanner';layer.hidden=true;
    layer.innerHTML=`<header class="event-qr-header"><button type="button" class="event-qr-close" aria-label="Fechar leitor de QR">‹</button><h1>Escanear perfil</h1><span></span></header><main class="event-qr-viewfinder"><video id="event-qr-video" playsinline muted aria-label="Imagem da câmera para leitura do QR Code"></video><div class="event-qr-shade" aria-hidden="true"><i></i></div><p id="event-qr-status" role="status" aria-live="polite">Aponte a câmera para o QR Code do perfil ROUDY.</p></main><footer class="event-qr-controls"><button type="button" id="event-qr-torch" aria-label="Ligar ou desligar lanterna" disabled><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 3 6 0-1 7 3 3-4 8h-2l-4-8 3-3z"/><path d="M9 10h6"/></svg><span>Lanterna</span></button><label class="event-qr-gallery"><input id="event-qr-file" type="file" accept="image/*" hidden><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m4 18 5-5 3 3 2-2 6 5"/></svg><span>Imagem</span></label></footer>`;
    layer.querySelector('.event-qr-close').addEventListener('click',close);
    byId('event-qr-torch').addEventListener('click',toggleTorch);
    byId('event-qr-file').addEventListener('change',scanFile);
    global.document.body.appendChild(layer);return layer;
  }
  function status(message){const target=byId('event-qr-status');if(target)target.textContent=message;}
  async function createDetector(){if(!('BarcodeDetector' in global))throw new Error('Este navegador não oferece leitura de QR Code. Use Buscar ou Compartilhar.');const formats=await global.BarcodeDetector.getSupportedFormats?.();if(formats&&!formats.includes('qr_code'))throw new Error('A leitura de QR Code não é suportada neste dispositivo.');return new global.BarcodeDetector({formats:['qr_code']});}
  async function open(id){
    eventId=String(id);busy=false;const layer=ensureLayer();layer.hidden=false;global.document.body.classList.add('event-qr-open');status('Aponte a câmera para o QR Code do perfil ROUDY.');
    try{detector=await createDetector();stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});const video=byId('event-qr-video');video.srcObject=stream;await video.play();configureTorch();scanLoop();}
    catch(error){status(error?.name==='NotAllowedError'?'A câmera não foi autorizada. Libere o acesso ou escolha uma imagem.':error.message||'Não foi possível iniciar a câmera.');}
  }
  function stop(){if(frame)cancelAnimationFrame(frame);frame=0;if(stream){stream.getTracks().forEach(track=>track.stop());stream=null;}const video=byId('event-qr-video');if(video)video.srcObject=null;}
  function close(){stop();const layer=byId('event-qr-scanner');if(layer)layer.hidden=true;global.document?.body.classList.remove('event-qr-open');eventId=null;busy=false;}
  async function scanLoop(time=0){if(!stream||busy)return;frame=requestAnimationFrame(scanLoop);if(time-lastScan<220)return;lastScan=time;const video=byId('event-qr-video');if(!video||video.readyState<2)return;try{const codes=await detector.detect(video);if(codes[0]?.rawValue)await handle(codes[0].rawValue);}catch(_error){}}
  async function handle(raw){
    if(busy)return;const identity=extractIdentity(raw);if(!identity){status('Este QR Code não contém um perfil ROUDY válido.');return;}busy=true;status('Perfil encontrado. Preparando convite…');
    try{const user=await global.eventUserInvites.inviteScanned(eventId,identity);close();global.showToast?.(`Convite enviado para ${user.name}.`);}
    catch(error){busy=false;status(error?.message||'Não foi possível convidar este perfil.');scanLoop();}
  }
  function configureTorch(){const button=byId('event-qr-torch'),track=stream?.getVideoTracks?.()[0],supported=Boolean(track?.getCapabilities?.().torch);if(button)button.disabled=!supported;}
  async function toggleTorch(){const track=stream?.getVideoTracks?.()[0],button=byId('event-qr-torch');if(!track||button?.disabled)return;const active=button.getAttribute('aria-pressed')==='true';try{await track.applyConstraints({advanced:[{torch:!active}]});button.setAttribute('aria-pressed',String(!active));}catch(_error){status('A lanterna não está disponível neste dispositivo.');}}
  async function scanFile(event){const file=event.target.files?.[0];event.target.value='';if(!file)return;try{detector=detector||await createDetector();const bitmap=await createImageBitmap(file),codes=await detector.detect(bitmap);bitmap.close?.();if(!codes[0]?.rawValue)throw new Error('Nenhum QR Code foi encontrado nessa imagem.');await handle(codes[0].rawValue);}catch(error){status(error.message||'Não foi possível ler essa imagem.');}}
  global.eventQrScanner=Object.freeze({open,close,extractIdentity});
  if(typeof module!=='undefined'&&module.exports)module.exports={extractIdentity};
})(typeof window!=='undefined'?window:globalThis);
