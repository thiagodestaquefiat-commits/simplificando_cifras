(function(global){
  "use strict";
  let overlay=null,stream=null,facing="environment",capturedFile=null,previewUrl=null,torch=false;

  const icon={
    close:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 5 14 14M19 5 5 19"/></svg>',
    flash:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m13.5 2-8 12h6L10.5 22l8-12h-6l1-8Z"/></svg>',
    gallery:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="m5 18 5-5 3 3 2-2 4 4"/></svg>',
    flip:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7h-4l-2-2h-4L8 7H4a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2Z"/><path d="M9 12a4 4 0 0 1 6.5-3M15 14a4 4 0 0 1-6.5 3M15.5 8.5v3h-3M8.5 17.5v-3h3"/></svg>'
  };
  function stopStream(){if(stream){stream.getTracks().forEach(track=>track.stop());stream=null}}
  function clearPreview(){if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl=null;capturedFile=null}
  function setStatus(message){const node=overlay?.querySelector('[data-camera-status]');if(node)node.textContent=message||''}
  function build(){
    overlay=document.createElement('section');overlay.className='roudy-camera';overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label','Câmera');
    overlay.innerHTML=`<div class="roudy-camera-viewfinder"><video class="roudy-camera-video" autoplay muted playsinline></video><img class="roudy-camera-review" alt="Prévia da foto" hidden><span class="roudy-camera-shade"></span></div><header class="roudy-camera-top"><button class="roudy-camera-icon" type="button" data-camera-close aria-label="Fechar câmera">${icon.close}</button><button class="roudy-camera-icon roudy-camera-flash" type="button" data-camera-flash aria-label="Ativar flash">${icon.flash}</button></header><p class="roudy-camera-status" data-camera-status role="status" aria-live="polite"></p><div class="roudy-camera-bottom" data-camera-controls><label class="roudy-camera-gallery" aria-label="Escolher imagem da galeria">${icon.gallery}<input type="file" accept="image/*" data-camera-gallery></label><button class="roudy-camera-shutter" type="button" data-camera-shutter aria-label="Tirar foto"></button><button class="roudy-camera-icon roudy-camera-flip" type="button" data-camera-flip aria-label="Trocar câmera">${icon.flip}</button></div><div class="roudy-camera-review-actions" data-camera-review-actions hidden><button class="roudy-camera-retake" type="button" data-camera-retake>Tirar outra</button><button class="roudy-camera-use" type="button" data-camera-use>Usar foto</button></div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('[data-camera-close]').addEventListener('click',close);
    overlay.querySelector('[data-camera-shutter]').addEventListener('click',capture);
    overlay.querySelector('[data-camera-flip]').addEventListener('click',flip);
    overlay.querySelector('[data-camera-flash]').addEventListener('click',toggleTorch);
    overlay.querySelector('[data-camera-retake]').addEventListener('click',retake);
    overlay.querySelector('[data-camera-use]').addEventListener('click',usePhoto);
    overlay.querySelector('[data-camera-gallery]').addEventListener('change',event=>{const file=event.target.files?.[0];if(file)review(file)});
  }
  async function start(){
    const video=overlay.querySelector('.roudy-camera-video');video.classList.toggle('is-front',facing==='user');video.hidden=false;overlay.querySelector('.roudy-camera-review').hidden=true;
    if(!navigator.mediaDevices?.getUserMedia){setStatus('A câmera ao vivo exige HTTPS. Você ainda pode escolher uma imagem pela galeria.');return}
    setStatus('Abrindo câmera…');stopStream();
    try{stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:facing},width:{ideal:1920},height:{ideal:1080}}});video.srcObject=stream;await video.play();setStatus('');syncTorchAvailability()}
    catch(error){setStatus(error?.name==='NotAllowedError'?'Autorize o acesso à câmera para tirar uma foto.':'Não foi possível abrir a câmera. Escolha uma imagem pela galeria.')}
  }
  function syncTorchAvailability(){const button=overlay?.querySelector('[data-camera-flash]'),track=stream?.getVideoTracks()[0],available=Boolean(track?.getCapabilities?.().torch);if(button)button.hidden=!available}
  async function toggleTorch(){const track=stream?.getVideoTracks()[0];if(!track?.getCapabilities?.().torch)return;torch=!torch;try{await track.applyConstraints({advanced:[{torch}]});const button=overlay.querySelector('[data-camera-flash]');button.classList.toggle('is-on',torch);button.setAttribute('aria-label',torch?'Desativar flash':'Ativar flash')}catch{torch=false}}
  function capture(){const video=overlay?.querySelector('.roudy-camera-video');if(!video||!stream||!video.videoWidth){setStatus('A câmera ainda não está pronta.');return}const canvas=document.createElement('canvas');canvas.width=video.videoWidth;canvas.height=video.videoHeight;const context=canvas.getContext('2d');if(facing==='user'){context.translate(canvas.width,0);context.scale(-1,1)}context.drawImage(video,0,0,canvas.width,canvas.height);canvas.toBlob(blob=>{if(blob)review(new File([blob],`roudy-${Date.now()}.jpg`,{type:'image/jpeg'}))},'image/jpeg',.92)}
  function review(file){if(!file?.type?.startsWith('image/')){setStatus('Escolha uma imagem válida.');return}clearPreview();capturedFile=file;previewUrl=URL.createObjectURL(file);stopStream();const video=overlay.querySelector('.roudy-camera-video'),image=overlay.querySelector('.roudy-camera-review');video.hidden=true;image.src=previewUrl;image.hidden=false;overlay.querySelector('[data-camera-controls]').hidden=true;overlay.querySelector('[data-camera-review-actions]').hidden=false;overlay.querySelector('[data-camera-flash]').hidden=true;setStatus('')}
  async function retake(){clearPreview();overlay.querySelector('[data-camera-controls]').hidden=false;overlay.querySelector('[data-camera-review-actions]').hidden=true;await start()}
  async function usePhoto(){
    if(!capturedFile)return;
    const file=capturedFile,actions=overlay.querySelector('[data-camera-review-actions]'),closeButton=overlay.querySelector('[data-camera-close]');
    actions.hidden=true;closeButton.disabled=true;setStatus('Analisando a foto e criando a música…');
    try{await global.aiHarmonicSummary.generateFiles([file]);close()}
    catch(error){setStatus(error?.message||'Não foi possível analisar esta foto.');actions.hidden=false;closeButton.disabled=false}
  }
  async function flip(){facing=facing==='environment'?'user':'environment';torch=false;await start()}
  function open(){if(overlay)return;build();document.documentElement.style.overflow='hidden';start()}
  function close(){stopStream();clearPreview();overlay?.remove();overlay=null;document.documentElement.style.removeProperty('overflow')}
  global.roudyCamera=Object.freeze({open,close});
})(window);
