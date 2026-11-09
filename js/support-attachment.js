/* Optional screenshot. Blob URLs live only while this form is open; no localStorage. */
(function(global){
  'use strict';
  const INPUT_MAX=5*1024*1024,OUTPUT_MAX=1024*1024,PIXELS=16000000;
  function dimensions(bytes){
    const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    if(bytes.length>=24&&[137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v)){
      let offset=8;
      while(offset+12<=bytes.length){
        const length=view.getUint32(offset),type=String.fromCharCode(...bytes.slice(offset+4,offset+8));
        if(type==='acTL')throw new Error('Use um print estático, sem animação.');
        if(length>bytes.length-offset-12)throw new Error('Arquivo PNG inválido.');
        offset+=12+length;
      }
      return [view.getUint32(16),view.getUint32(20)];
    }
    if(bytes[0]===255&&bytes[1]===216){
      let i=2;
      while(i+4<bytes.length){
        if(bytes[i++]!==255)break;
        while(bytes[i]===255)i++;
        const marker=bytes[i++];if(marker===0xda||marker===0xd9)break;
        if(marker===0x01||marker>=0xd0&&marker<=0xd7)continue;
        if(i+2>bytes.length)break;const length=view.getUint16(i);
        if(length<2||i+length>bytes.length)break;
        if([0xc0,0xc1,0xc2].includes(marker)&&length>=8)return [view.getUint16(i+5),view.getUint16(i+3)];
        i+=length;
      }
    }
    throw new Error('Use um print PNG ou JPEG. HEIC, GIF, SVG e vídeos não são aceitos.');
  }
  async function compress(file){
    if(file.size>INPUT_MAX)throw new Error('Escolha uma imagem de até 5 MB.');
    const bytes=new Uint8Array(await file.arrayBuffer()),[width,height]=dimensions(bytes);
    if(!width||!height||width*height>PIXELS||Math.max(width,height)>12000)throw new Error('Imagem muito grande. Recorte para até 16 milhões de pixels.');
    const url=URL.createObjectURL(file),image=new Image();
    try{
      image.src=url;await image.decode();
      if(image.naturalWidth*image.naturalHeight>PIXELS)throw new Error('Imagem muito grande. Recorte o print.');
      const ratio=Math.min(1,2000/Math.max(image.naturalWidth,image.naturalHeight)),canvas=document.createElement('canvas');
      canvas.width=Math.max(1,Math.round(image.naturalWidth*ratio));canvas.height=Math.max(1,Math.round(image.naturalHeight*ratio));
      const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Não foi possível processar a imagem neste navegador.');
      ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
      const encode=(type,quality)=>new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Falha ao preparar imagem.')),type,quality));
      let blob=await encode('image/png');if(blob.size<=OUTPUT_MAX)return blob;
      for(const quality of [.9,.85,.75,.65]){blob=await encode('image/jpeg',quality);if(blob.size<=OUTPUT_MAX)return blob;}
      throw new Error('Não foi possível reduzir com legibilidade. Recorte o print ou envie somente o texto.');
    }finally{URL.revokeObjectURL(url);image.src='';}
  }
  function create(form){
    const host=document.createElement('section');host.className='support-attachment';
    host.innerHTML='<label class="support-attachment-trigger" for="bug-image"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8" cy="8" r="1.5"/><path d="m4 17 5-5 4 4 3-3 5 5"/></svg><span>Anexar print <small>(opcional)</small></span></label><input type="file" id="bug-image" accept="image/png,image/jpeg" aria-describedby="bug-image-hint bug-image-status"><p id="bug-image-hint">Adicione um print para mostrar o problema. Antes de enviar, confira se ele não mostra informações pessoais.</p><div class="support-attachment-preview" hidden><img alt="Prévia do print que será enviado ao suporte"><div><span class="support-attachment-size"></span><button type="button">Remover imagem</button></div></div><p id="bug-image-status" role="status" aria-live="polite"></p>';
    form.querySelector('.bug-report-privacy').before(host);
    const input=host.querySelector('input'),preview=host.querySelector('.support-attachment-preview'),image=host.querySelector('img'),status=host.querySelector('[role=status]'),remove=host.querySelector('button');
    let blob=null,identity='',url='',sequence=0,processing=false,locked=false;
    function clear(resetInput=true){++sequence;blob=null;identity='';if(url)URL.revokeObjectURL(url);url='';image.removeAttribute('src');preview.hidden=true;if(resetInput)input.value='';processing=false;}
    input.addEventListener('change',async()=>{
      const file=input.files[0];if(!file)return;clear(false);status.textContent='';
      const turn=sequence;processing=true;status.textContent='Preparando imagem…';
      try{
        const result=await compress(file);if(turn!==sequence||!form.isConnected)return;
        blob=result;identity=crypto.randomUUID();url=URL.createObjectURL(blob);image.src=url;preview.hidden=false;
        host.querySelector('.support-attachment-size').textContent='Print preparado · '+Math.ceil(blob.size/1024)+' KB';
        status.textContent='Confira se o texto do print está legível. Você pode remover a imagem e enviar somente o relato.';
      }catch(error){if(turn===sequence&&form.isConnected){input.value='';status.textContent=(error.name==='EncodingError'?'Não foi possível abrir esta imagem. Escolha outro print.':error.message)+' Você pode enviar somente o texto.';}}
      finally{if(turn===sequence)processing=false;}
    });
    remove.addEventListener('click',()=>{if(!locked){clear();status.textContent='Imagem removida. O texto foi mantido.';}});
    const observer=new MutationObserver(()=>{if(!form.isConnected){clear();observer.disconnect();}});
    observer.observe(document.body,{childList:true,subtree:true});
    return {get blob(){return blob;},get identity(){return identity;},get processing(){return processing;},lock(value){locked=value;input.disabled=remove.disabled=value;host.classList.toggle('is-locked',value);}};
  }
  global.supportAttachment=Object.freeze({create});
})(window);
