(function(global){
  'use strict';

  const FORMATS=Object.freeze({portrait:Object.freeze({width:1080,height:1350,ratio:'4 / 5'})});
  const GRADIENTS=Object.freeze([
    Object.freeze({blue:[.08,.10],warm:[.88,.12]}),
    Object.freeze({blue:[.88,.22],warm:[.10,.82]}),
    Object.freeze({blue:[.52,.02],warm:[.92,.76]}),
    Object.freeze({blue:[.16,.58],warm:[.78,.92]})
  ]);
  const clean=value=>String(value==null?'':value).trim();
  const hash=value=>{let result=2166136261;for(const char of clean(value)){result^=char.charCodeAt(0);result=Math.imul(result,16777619)}return result>>>0};
  const gradientVariant=eventId=>hash(eventId)%GRADIENTS.length;
  const escapeHtml=value=>clean(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const formatDate=value=>{const iso=clean(value);if(!/^\d{4}-\d{2}-\d{2}$/.test(iso))return iso;const [year,month,day]=iso.split('-').map(Number);return new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'short',year:'numeric'}).format(new Date(year,month-1,day)).replace('.','')};

  function createData(event,songsById,options={}){
    const lookup=typeof songsById==='function'?songsById:id=>songsById instanceof Map?songsById.get(String(id)):songsById?.[String(id)];
    const songs=(Array.isArray(event?.repertoire)?event.repertoire:[]).map(item=>{
      const source=lookup(item.songId)||{},shared=item.shared||{};
      return {title:clean(shared.title)||clean(source.title),artist:clean(shared.artist)||clean(source.artist)};
    }).filter(song=>song.title);
    return Object.freeze({id:clean(event?.id),title:clean(event?.title)||'Evento ROUDY',date:formatDate(event?.date),time:clean(event?.time),location:clean(event?.location)||clean(event?.eventLocation?.name)||clean(event?.eventLocation?.formattedAddress),songs:Object.freeze(songs.map(Object.freeze)),visibleSongs:Object.freeze(songs.slice(0,4).map(Object.freeze)),remainingCount:Math.max(0,songs.length-4),variant:gradientVariant(event?.id),link:clean(options.link)});
  }

  function cardMarkup(data){
    const songs=data.visibleSongs.map(song=>`<li><strong>${escapeHtml(song.title)}</strong>${song.artist?`<span>${escapeHtml(song.artist)}</span>`:''}</li>`).join('');
    return `<article class="event-share-card event-share-card--v${data.variant}" style="aspect-ratio:${FORMATS.portrait.ratio}" aria-label="Arte para compartilhar o evento ${escapeHtml(data.title)}"><span class="event-share-brand">ROUDY</span><header><h2>${escapeHtml(data.title)}</h2><p>${[data.date,data.time].filter(Boolean).map(escapeHtml).join(' · ')}</p>${data.location?`<p>${escapeHtml(data.location)}</p>`:''}</header><section><h3>REPERTÓRIO</h3>${songs?`<ol>${songs}</ol>`:'<p class="event-share-empty">Repertório ainda vazio</p>'}${data.remainingCount?`<strong class="event-share-remaining">+ ${data.remainingCount} ${data.remainingCount===1?'música':'músicas'}</strong>`:''}</section><footer>ROUDY</footer></article>`;
  }

  function drawWrapped(context,text,x,y,maxWidth,lineHeight,maxLines){
    const words=clean(text).split(/\s+/);let line='',lines=[];
    for(const word of words){const test=line?line+' '+word:word;if(context.measureText(test).width>maxWidth&&line){lines.push(line);line=word}else line=test}
    if(line)lines.push(line);lines=lines.slice(0,maxLines);if(words.length&&lines.length===maxLines&&context.measureText(lines.join(' ')).width<context.measureText(clean(text)).width){while(context.measureText(lines[maxLines-1]+'…').width>maxWidth)lines[maxLines-1]=lines[maxLines-1].slice(0,-1);lines[maxLines-1]+='…'}
    lines.forEach((value,index)=>context.fillText(value,x,y+index*lineHeight));return y+lines.length*lineHeight;
  }

  function renderToCanvas(data,documentRef=global.document,format='portrait'){
    const size=FORMATS[format]||FORMATS.portrait,canvas=documentRef.createElement('canvas');canvas.width=size.width;canvas.height=size.height;const ctx=canvas.getContext('2d'),variant=GRADIENTS[data.variant];
    const base=ctx.createLinearGradient(0,0,size.width,size.height);base.addColorStop(0,'#071a36');base.addColorStop(.48,'#06101f');base.addColorStop(1,'#020406');ctx.fillStyle=base;ctx.fillRect(0,0,size.width,size.height);
    const glow=(point,color,radius)=>{const g=ctx.createRadialGradient(point[0]*size.width,point[1]*size.height,0,point[0]*size.width,point[1]*size.height,radius);g.addColorStop(0,color);g.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=g;ctx.fillRect(0,0,size.width,size.height)};
    glow(variant.blue,'rgba(20,112,255,.52)',760);glow(variant.warm,'rgba(232,176,64,.18)',430);
    const left=92,right=size.width-92,max=right-left;ctx.fillStyle='#d9e7ff';ctx.font='700 30px system-ui,sans-serif';ctx.letterSpacing='6px';ctx.fillText('ROUDY',left,92);ctx.letterSpacing='0px';ctx.fillStyle='#fff';ctx.font='800 68px system-ui,sans-serif';let y=drawWrapped(ctx,data.title,left,195,max,78,2);
    ctx.fillStyle='rgba(255,255,255,.78)';ctx.font='500 29px system-ui,sans-serif';const schedule=[data.date,data.time].filter(Boolean).join(' · ');if(schedule){ctx.fillText(schedule,left,y+18);y+=48}if(data.location){ctx.fillText(data.location.slice(0,52),left,y+10);y+=45}
    y=Math.max(y+65,390);ctx.fillStyle='rgba(255,255,255,.6)';ctx.font='700 22px system-ui,sans-serif';ctx.letterSpacing='4px';ctx.fillText('REPERTÓRIO',left,y);ctx.letterSpacing='0px';y+=64;
    if(!data.visibleSongs.length){ctx.fillStyle='rgba(255,255,255,.66)';ctx.font='500 30px system-ui,sans-serif';ctx.fillText('Repertório ainda vazio',left,y)}
    data.visibleSongs.forEach(song=>{ctx.fillStyle='#fff';ctx.font='700 34px system-ui,sans-serif';y=drawWrapped(ctx,song.title,left,y,max,40,1);if(song.artist){ctx.fillStyle='rgba(255,255,255,.62)';ctx.font='500 25px system-ui,sans-serif';ctx.fillText(song.artist.slice(0,58),left,y+3);y+=34}y+=36});
    if(data.remainingCount){ctx.fillStyle='#9fc2ff';ctx.font='700 27px system-ui,sans-serif';ctx.fillText(`+ ${data.remainingCount} ${data.remainingCount===1?'música':'músicas'}`,left,y+4)}
    ctx.fillStyle='rgba(255,255,255,.72)';ctx.font='700 25px system-ui,sans-serif';ctx.textAlign='right';ctx.fillText('ROUDY',right,size.height-70);ctx.textAlign='left';return canvas;
  }
  const canvasBlob=canvas=>new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Não foi possível gerar a imagem.')),'image/png',1));
  async function renderImage(data,documentRef){return canvasBlob(renderToCanvas(data,documentRef))}
  function shareText(data){return [data.title,[data.date,data.time].filter(Boolean).join(' · '),data.location,data.link].filter(Boolean).join('\n')}
  async function share(data,imageBlob,navigatorRef=global.navigator){
    const text=shareText(data),file=imageBlob&&typeof File!=='undefined'?new File([imageBlob],`roudy-${data.id||'evento'}.png`,{type:'image/png'}):null;
    if(navigatorRef?.share){if(file&&navigatorRef.canShare?.({files:[file]})){await navigatorRef.share({title:data.title,text,url:data.link||undefined,files:[file]});return {kind:'file'}}await navigatorRef.share({title:data.title,text,url:data.link||undefined});return {kind:'text'}}
    return {kind:'fallback',text};
  }
  global.roudyEventShare=Object.freeze({FORMATS,gradientVariant,createData,cardMarkup,renderToCanvas,renderImage,shareText,share});
  if(typeof module!=='undefined'&&module.exports)module.exports=global.roudyEventShare;
})(typeof window!=='undefined'?window:globalThis);
