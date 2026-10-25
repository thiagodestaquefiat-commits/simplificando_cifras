(function(global){
  'use strict';

  const FORMATS=Object.freeze({compact:Object.freeze({width:1080,height:1080,ratio:'1 / 1'})});
  const GRADIENTS=Object.freeze([
    Object.freeze({base:['#071a36','#06101f','#020406'],primary:'rgba(20,112,255,.58)',secondary:'rgba(232,176,64,.24)',accent:'#9fc2ff',blue:[.08,.10],warm:[.88,.12]}),
    Object.freeze({base:['#24113d','#100d22','#040308'],primary:'rgba(143,76,255,.55)',secondary:'rgba(255,92,138,.25)',accent:'#d6b8ff',blue:[.88,.22],warm:[.10,.82]}),
    Object.freeze({base:['#092f2b','#071815','#020605'],primary:'rgba(24,190,154,.48)',secondary:'rgba(226,177,57,.25)',accent:'#91e7d1',blue:[.52,.02],warm:[.92,.76]}),
    Object.freeze({base:['#351410','#1d0c0b','#070302'],primary:'rgba(230,76,54,.48)',secondary:'rgba(244,172,48,.27)',accent:'#ffc09c',blue:[.16,.58],warm:[.78,.92]}),
    Object.freeze({base:['#17283e','#0b1728','#03070c'],primary:'rgba(64,139,214,.54)',secondary:'rgba(70,205,190,.22)',accent:'#a8d8ff',blue:[.82,.08],warm:[.12,.72]}),
    Object.freeze({base:['#302510','#181207','#050402'],primary:'rgba(229,166,45,.45)',secondary:'rgba(198,83,48,.25)',accent:'#f5d78c',blue:[.18,.12],warm:[.86,.68]}),
    Object.freeze({base:['#251531','#120b1a','#050307'],primary:'rgba(205,75,190,.43)',secondary:'rgba(82,108,235,.28)',accent:'#e4b7df',blue:[.84,.62],warm:[.14,.10]}),
    Object.freeze({base:['#102d3b','#071820','#020608'],primary:'rgba(33,173,210,.48)',secondary:'rgba(105,207,112,.22)',accent:'#9edeea',blue:[.12,.76],warm:[.84,.14]}),
    Object.freeze({base:['#151515','#09090b','#020202'],primary:'rgba(255,250,232,.38)',secondary:'rgba(255,218,142,.2)',accent:'#f4e4bd',blue:[.12,.10],warm:[.88,.18]})
  ]);
  const clean=value=>String(value==null?'':value).trim();
  const hash=value=>{let result=2166136261;for(const char of clean(value)){result^=char.charCodeAt(0);result=Math.imul(result,16777619)}return result>>>0};
  const gradientVariant=eventIdentity=>hash(eventIdentity)%GRADIENTS.length;
  const escapeHtml=value=>clean(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const formatDate=value=>{const iso=clean(value);if(!/^\d{4}-\d{2}-\d{2}$/.test(iso))return iso;const [year,month,day]=iso.split('-').map(Number);return new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'short',year:'numeric'}).format(new Date(year,month-1,day)).replace('.','')};

  function createData(event,songsById,options={}){
    const lookup=typeof songsById==='function'?songsById:id=>songsById instanceof Map?songsById.get(String(id)):songsById?.[String(id)];
    const songs=(Array.isArray(event?.repertoire)?event.repertoire:[]).map(item=>{
      const source=lookup(item.songId)||{},shared=item.shared||{};
      return {title:clean(shared.title)||clean(source.title),artist:clean(shared.artist)||clean(source.artist)};
    }).filter(song=>song.title);
    const id=clean(event?.id),title=clean(event?.title)||'Evento ROUDY',date=formatDate(event?.date),time=clean(event?.time),location=clean(event?.location)||clean(event?.eventLocation?.name)||clean(event?.eventLocation?.formattedAddress);
    const identity=[id,title,clean(event?.date),time,location].join('|');
    return Object.freeze({id,title,date,time,location,songs:Object.freeze(songs.map(Object.freeze)),visibleSongs:Object.freeze(songs.slice(0,4).map(Object.freeze)),remainingCount:Math.max(0,songs.length-4),variant:gradientVariant(identity),link:clean(options.link)});
  }

  function cardMarkup(data){
    const songs=data.visibleSongs.map(song=>`<li><strong>${escapeHtml(song.title)}</strong>${song.artist?`<span>${escapeHtml(song.artist)}</span>`:''}</li>`).join('');
    return `<article class="event-share-card event-share-card--compact event-share-card--v${data.variant}" style="aspect-ratio:${FORMATS.compact.ratio}" aria-label="Prévia completa do evento ${escapeHtml(data.title)}"><span class="event-share-brand">ROUDY</span><header><h2>${escapeHtml(data.title)}</h2><p>${[data.date,data.time].filter(Boolean).map(escapeHtml).join(' · ')}</p>${data.location?`<p>${escapeHtml(data.location)}</p>`:''}</header><section><h3>REPERTÓRIO</h3>${songs?`<ol>${songs}</ol>`:'<p class="event-share-empty">Repertório ainda vazio</p>'}${data.remainingCount?`<strong class="event-share-remaining">+ ${data.remainingCount} ${data.remainingCount===1?'música':'músicas'}</strong>`:''}</section><footer>ROUDY</footer></article>`;
  }

  function drawWrapped(context,text,x,y,maxWidth,lineHeight,maxLines){
    const words=clean(text).split(/\s+/);let line='',lines=[];
    for(const word of words){const test=line?line+' '+word:word;if(context.measureText(test).width>maxWidth&&line){lines.push(line);line=word}else line=test}
    if(line)lines.push(line);lines=lines.slice(0,maxLines);if(words.length&&lines.length===maxLines&&context.measureText(lines.join(' ')).width<context.measureText(clean(text)).width){while(context.measureText(lines[maxLines-1]+'…').width>maxWidth)lines[maxLines-1]=lines[maxLines-1].slice(0,-1);lines[maxLines-1]+='…'}
    lines.forEach((value,index)=>context.fillText(value,x,y+index*lineHeight));return y+lines.length*lineHeight;
  }

  function renderToCanvas(data,documentRef=global.document,format='compact'){
    const size=FORMATS[format]||FORMATS.compact,canvas=documentRef.createElement('canvas');canvas.width=size.width;canvas.height=size.height;const ctx=canvas.getContext('2d'),variant=GRADIENTS[data.variant];
    const radius=56;ctx.clearRect(0,0,size.width,size.height);ctx.beginPath();ctx.moveTo(radius,0);ctx.lineTo(size.width-radius,0);ctx.quadraticCurveTo(size.width,0,size.width,radius);ctx.lineTo(size.width,size.height-radius);ctx.quadraticCurveTo(size.width,size.height,size.width-radius,size.height);ctx.lineTo(radius,size.height);ctx.quadraticCurveTo(0,size.height,0,size.height-radius);ctx.lineTo(0,radius);ctx.quadraticCurveTo(0,0,radius,0);ctx.closePath();ctx.clip();
    const base=ctx.createLinearGradient(0,0,size.width,size.height);base.addColorStop(0,variant.base[0]);base.addColorStop(.48,variant.base[1]);base.addColorStop(1,variant.base[2]);ctx.fillStyle=base;ctx.fillRect(0,0,size.width,size.height);
    const glow=(point,color,radius)=>{const g=ctx.createRadialGradient(point[0]*size.width,point[1]*size.height,0,point[0]*size.width,point[1]*size.height,radius);g.addColorStop(0,color);g.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=g;ctx.fillRect(0,0,size.width,size.height)};
    glow(variant.blue,variant.primary,900);glow(variant.warm,variant.secondary,620);
    const left=92,right=size.width-92,max=right-left;ctx.fillStyle='#d9e7ff';ctx.font='700 30px system-ui,sans-serif';ctx.letterSpacing='6px';ctx.fillText('ROUDY',left,92);ctx.letterSpacing='0px';ctx.fillStyle='#fff';ctx.font='800 68px system-ui,sans-serif';let y=drawWrapped(ctx,data.title,left,195,max,78,2);
    ctx.fillStyle='rgba(255,255,255,.78)';ctx.font='500 29px system-ui,sans-serif';const schedule=[data.date,data.time].filter(Boolean).join(' · ');if(schedule){ctx.fillText(schedule,left,y+18);y+=48}if(data.location){ctx.fillText(data.location.slice(0,52),left,y+10);y+=45}
    y=Math.max(y+65,390);ctx.fillStyle='rgba(255,255,255,.6)';ctx.font='700 22px system-ui,sans-serif';ctx.letterSpacing='4px';ctx.fillText('REPERTÓRIO',left,y);ctx.letterSpacing='0px';y+=64;
    if(!data.visibleSongs.length){ctx.fillStyle='rgba(255,255,255,.66)';ctx.font='500 30px system-ui,sans-serif';ctx.fillText('Repertório ainda vazio',left,y)}
    data.visibleSongs.forEach(song=>{ctx.fillStyle='#fff';ctx.font='700 34px system-ui,sans-serif';y=drawWrapped(ctx,song.title,left,y,max,40,1);if(song.artist){ctx.fillStyle='rgba(255,255,255,.62)';ctx.font='500 25px system-ui,sans-serif';ctx.fillText(song.artist.slice(0,58),left,y+3);y+=34}y+=36});
    if(data.remainingCount){ctx.fillStyle=variant.accent;ctx.font='700 27px system-ui,sans-serif';ctx.fillText(`+ ${data.remainingCount} ${data.remainingCount===1?'música':'músicas'}`,left,y+4)}
    ctx.fillStyle='rgba(255,255,255,.72)';ctx.font='700 25px system-ui,sans-serif';ctx.textAlign='right';ctx.fillText('ROUDY',right,size.height-48);ctx.textAlign='left';return canvas;
  }
  const canvasBlob=canvas=>new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Não foi possível gerar a imagem.')),'image/png',1));
  async function renderImage(data,documentRef){return canvasBlob(renderToCanvas(data,documentRef))}
  function shareText(data){return [data.title,[data.date,data.time].filter(Boolean).join(' · '),data.location,data.link].filter(Boolean).join('\n')}
  function imageFilename(data){const slug=clean(data.title).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9]+/g,'-').replace(/^-|-$/g,'').toLowerCase()||'evento';return `roudy-${slug}.png`}
  async function share(data,imageBlob,navigatorRef=global.navigator){
    if(!imageBlob)return {kind:'unavailable'};
    const file=typeof global.File==='function'?new global.File([imageBlob],imageFilename(data),{type:'image/png'}):null;
    const payload=file?{title:data.title,text:shareText({...data,link:''}),files:[file]}:null;
    if(payload&&navigatorRef?.share&&(!navigatorRef.canShare||navigatorRef.canShare(payload))){await navigatorRef.share(payload);return {kind:'image',file}}
    return {kind:'download',blob:imageBlob,filename:imageFilename(data)};
  }
  global.roudyEventShare=Object.freeze({FORMATS,gradientVariant,createData,cardMarkup,renderToCanvas,renderImage,shareText,imageFilename,share});
  if(typeof module!=='undefined'&&module.exports)module.exports=global.roudyEventShare;
})(typeof window!=='undefined'?window:globalThis);
