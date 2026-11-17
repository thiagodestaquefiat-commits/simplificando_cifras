(function(global){
  'use strict';
  const el=id=>document.getElementById(id),normalize=value=>String(value||'').trim().toLocaleLowerCase('pt-BR');
  let timer=0,returnScroll=0,headerFrame=0,requestId=0,controller=null,searchService=null;
  const service=()=>searchService||(searchService=global.songSearch.create(global.searchLibraryBridge));
  function songs(){return Array.isArray(global.musicas)?global.musicas:(typeof musicas!=='undefined'&&Array.isArray(musicas)?musicas:[])}
  function recentSongs(){const profile=typeof global.accountProfile==='function'?global.accountProfile():global.appCurrentUser||{},userId=String(profile.id||'local'),stored=global.storage?.get?.('sc_recent_opened_songs_v1',{}),entries=stored&&typeof stored==='object'&&!Array.isArray(stored)&&Array.isArray(stored[userId])?stored[userId]:[],legacy=global.storage?.get?.('sc_home_last_opened_song_v1',null),ordered=entries.length?entries:legacy?[legacy]:[],seen=new Set();return ordered.map(entry=>songs().find(song=>String(song.id)===String(entry?.songId))).filter(song=>{if(!song||seen.has(String(song.id)))return false;seen.add(String(song.id));return true}).slice(0,5)}
  function icon(){return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18V6l10-2v12"/><circle cx="6" cy="18" r="3"/><circle cx="16" cy="16" r="3"/></svg>'}
  function nextEvent(){const now=new Date(),values=Array.isArray(global.setlists)?global.setlists:(typeof setlists!=='undefined'?setlists:[]);return values.filter(item=>item?.date).map(item=>({item,date:new Date(`${item.date}T${item.time||'23:59'}`)})).filter(value=>Number.isFinite(value.date.getTime())&&value.date>=now).sort((a,b)=>a.date-b.date)[0]?.item||null}
  function renderIdentity(){const target=el('roudy-search-avatar');if(!target)return;const profile=typeof global.accountProfile==='function'?global.accountProfile():global.appCurrentUser||{};target.className='roudy-search-avatar'+(profile.avatarUrl?' has-image':` roudy-avatar-fallback ${global.eventAvatarPaletteClass?.(profile.id||profile.name)||''}`);target.innerHTML=profile.avatarUrl?`<img src="${global.eventEsc(profile.avatarUrl)}" alt="">`:global.eventEsc(global.eventInitials?.(profile.name)||String(profile.name||'R').slice(0,1).toUpperCase())}
  function renderCardMeta(){const event=nextEvent(),eventMeta=el('roudy-search-events-meta'),playlistMeta=el('roudy-search-playlists-meta'),medleyMeta=el('roudy-search-medley-meta');if(eventMeta)eventMeta.textContent=event?`Próximo: ${typeof global.eventDisplayDate==='function'?global.eventDisplayDate(event.date):event.date}`:'Nenhum próximo evento';if(playlistMeta)playlistMeta.textContent=`${songs().length} ${songs().length===1?'música salva':'músicas salvas'}`;const blocks=Array.isArray(global.medleyBlocos)?global.medleyBlocos:(typeof medleyBlocos!=='undefined'&&Array.isArray(medleyBlocos)?medleyBlocos:[]);if(medleyMeta)medleyMeta.textContent=blocks.length?'Continuar criação':'Criar novo medley'}
  // This rail intentionally contains songs only. Until the product has reliable
  // community-save signals, it prioritizes the next repertoire and then other
  // available songs without presenting either source as a popularity claim.
  function recommendations(recent){const seen=new Set(recent.map(song=>String(song.id))),items=[];const event=nextEvent();if(event)for(const entry of event.repertoire||[]){const song=global.eventSongSource?.(event,entry)||songs().find(value=>String(value.id)===String(entry.songId));if(song&&!seen.has(String(song.id))){seen.add(String(song.id));items.push(song)}}for(const song of songs()){if(items.length>=6)break;if(!seen.has(String(song.id))){seen.add(String(song.id));items.push(song)}}return items.slice(0,6)}
  function applyCoverLight(light, image) {
    if (!light?.isConnected) return;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 24;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(image, 0, 0, 24, 24);
      const pixels = ctx.getImageData(0, 0, 24, 24).data;
      const totals = [0, 0, 0];
      let sampleWeight = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        const alpha = pixels[i + 3] / 255;
        for (let channel = 0; channel < 3; channel++) {
          totals[channel] += pixels[i + channel] * alpha;
        }
        sampleWeight += alpha;
      }
      if (sampleWeight) {
        const average = totals.map(total => total / sampleWeight);
        const brightness = Math.min(1, 160 / Math.max(...average));
        const color = average.map(channel => Math.round(channel * brightness));
        light.style.setProperty('--cover-light', `rgb(${color.join(', ')})`);
        light.classList.add('has-color');
      }
    } catch {
      if (!image.crossOrigin && light.isConnected) {
        const readable = new Image();
        readable.crossOrigin = 'anonymous';
        readable.onload = () => applyCoverLight(light, readable);
        readable.src = image.currentSrc || image.src;
      }
    }
  }

  function renderForYou(recent){
    const target=el('roudy-search-for-you');
    const items=recommendations(recent);
    if(!target)return;
    target.hidden=!items.length;
    if(!items.length)return;
    const cards=items.map(song=>{
      const art=global.roudyListLoading?.artwork(song,{frameClass:'roudy-search-for-you-art'})||icon();
      const cover=global.songArtwork?.resolveReal?.(song);
      const light=cover
        ? `<span class="roudy-search-cover-light" aria-hidden="true"><img src="${global.eventEsc(cover)}" alt="" loading="lazy" decoding="async"></span>`
        : '';
      const title=global.eventEsc(song.title);
      const artist=global.eventEsc(song.artist||'Artista não informado');
      return `<button type="button" class="roudy-search-for-you-card" data-search-song="${global.eventEsc(song.id)}">
        <span class="roudy-search-for-you-cover">${art}${light}</span>
        <strong>${title}</strong>
        <small>${artist}</small>
      </button>`;
    }).join('');
    target.innerHTML=`<div class="roudy-search-for-you-heading"><h2 class="roudy-search-section-title">Feito para você</h2></div>
      <div class="roudy-search-for-you-rail">${cards}</div>`;
    for (const light of target.querySelectorAll('.roudy-search-cover-light')) {
      const image = light.querySelector('img');
      if (image.complete && image.naturalWidth) applyCoverLight(light, image);
      else image.addEventListener('load', () => applyCoverLight(light, image), {once:true});
    }
  }
  function renderLanding(){renderIdentity();renderCardMeta();const target=el('roudy-search-resume'),recent=recentSongs();if(!target)return;target.hidden=!recent.length;if(recent.length){target.innerHTML=`<h2 class="roudy-search-section-title">Continue de onde parou</h2>${recent.map(song=>{const art=global.roudyListLoading?.artwork(song,{frameClass:'roudy-search-resume-art'})||icon();return `<button type="button" class="roudy-search-resume" data-search-song="${global.eventEsc(song.id)}"><span class="roudy-search-resume-icon">${art}</span><span class="roudy-search-resume-copy"><strong>${global.eventEsc(song.title)}</strong><small>${global.eventEsc(song.artist||'Artista não informado')}</small></span><span class="roudy-search-resume-go" aria-hidden="true">›</span></button>`}).join('')}`}renderForYou(recent)}
  function updateHeaderCompact(){headerFrame=0;const root=el('roudy-search'),scroller=root?.querySelector('.roudy-search-scroll');if(!root||!scroller)return;const active=root.classList.contains('is-active'),progress=active?1:Math.min(1,Math.max(0,scroller.scrollTop/82));root.style.setProperty('--roudy-search-header-progress',progress.toFixed(3));root.classList.toggle('is-header-compact',root.classList.contains('is-open')&&!active&&progress>0)}
  function scheduleHeaderCompact(){if(!headerFrame)headerFrame=requestAnimationFrame(updateHeaderCompact)}
  function setActive(active,{focus=false}={}){const root=el('roudy-search');if(!root)return;root.classList.toggle('is-active',active);el('roudy-search-landing').hidden=active;el('roudy-search-active').hidden=!active;scheduleHeaderCompact();if(active){renderResults();if(focus)requestAnimationFrame(()=>el('roudy-search-input')?.focus({preventScroll:true}))}}
  function expandHeaderSearch(){const root=el('roudy-search'),scroller=root?.querySelector('.roudy-search-scroll');if(!root)return;root.classList.remove('is-header-compact');scroller?.scrollTo({top:0,behavior:'smooth'});requestAnimationFrame(()=>el('roudy-search-input')?.focus({preventScroll:true}))}
  function open(){const root=el('roudy-search');if(!root)return;returnScroll=window.scrollY;global.setPlaylistSearchMode?.(true);root.hidden=false;requestAnimationFrame(()=>root.classList.add('is-open'));document.body.dataset.searchOpen='';document.documentElement.classList.add('roudy-search-open');renderLanding();setActive(false);el('roudy-search-input').value='';root.querySelector('.roudy-search-scroll')?.scrollTo({top:0});updateClear();scheduleHeaderCompact()}
  function close(){const root=el('roudy-search');if(!root)return;clearTimeout(timer);requestId++;controller?.abort();global.schedulePlaylistOnlineSearch?.('');global.setPlaylistSearchMode?.(false);el('roudy-search-input')?.blur();root.classList.remove('is-open','is-active','is-header-compact');document.body.removeAttribute('data-search-open');document.documentElement.classList.remove('roudy-search-open');setTimeout(()=>{root.hidden=true;window.scrollTo(0,returnScroll);global.restorePrimarySearchTab?.()},220)}
  function activate(){if(!el('roudy-search')?.classList.contains('is-active'))setActive(true,{focus:true})}
  function cancel(){clearTimeout(timer);requestId++;controller?.abort();el('roudy-search-input').value='';updateClear();el('roudy-search-input').blur();setActive(false)}
  function updateClear(){const input=el('roudy-search-input'),clear=el('roudy-search-clear');if(clear)clear.hidden=!input?.value;const voice=el('roudy-search-voice');if(voice)voice.hidden=!(global.SpeechRecognition||global.webkitSpeechRecognition)}
  function setFilter(){renderResults()}
  function moreIcon(){return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>'}
  const searchIcon=()=>'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="7"/><path d="m16 16 5 5"/></svg>';
  function feedback(message){el('roudy-search-feedback').textContent=message}
  function renderSongs(items,query){
    const target=el('roudy-search-results');target.replaceChildren();
    const suggestions=el('roudy-search-suggestions');suggestions.replaceChildren();
    if(query)service().suggestions(items,query).forEach(value=>{
      const button=document.createElement('button');button.type='button';button.className='roudy-search-suggestion';
      button.innerHTML=searchIcon()+'<span></span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6H6v12M6 6l13 13"/></svg>';
      const label=value.replace(' — ',' ');button.querySelector('span').textContent=label;button.setAttribute('aria-label','Pesquisar '+label);
      button.onclick=()=>{el('roudy-search-input').value=value;renderResults();el('roudy-search-input').focus({preventScroll:true})};suggestions.append(button);
    });
    items.forEach(item=>{
      const row=document.createElement('div');row.className='roudy-search-song-row';
      const open=document.createElement('button');open.type='button';open.className='roudy-search-song-open';
      open.innerHTML='<span class="roudy-search-song-art">'+(global.roudyListLoading?.artwork(item)||icon())+'</span><span class="roudy-search-song-copy"><strong></strong><small></small></span>';
      open.querySelector('strong').textContent=item.title;open.querySelector('small').textContent=item.artist||'Artista não informado';
      open.onclick=async()=>{global.savePlaylistSearch?.(el('roudy-search-input')?.value||'');open.disabled=true;try{await service().open(item)}catch(_){feedback('Não foi possível abrir esta música. Tente novamente.')}finally{open.disabled=false}};
      const add=document.createElement('button');add.type='button';add.className='roudy-search-save';
      const paint=()=>{const state=service().state(item);add.dataset.state=state;add.disabled=state==='saved';add.setAttribute('aria-label',state==='saved'?item.title+' salva na biblioteca':state==='pending'?'Confirmar '+item.title+' na conta':'Adicionar '+item.title+' à biblioteca');add.innerHTML=state==='saved'?'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="m7 12 3 3 7-7"/></svg>':state==='pending'?'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>':'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v10M7 12h10"/></svg>'};paint();
      add.onclick=async()=>{const owner=global.searchLibraryBridge.owner();add.disabled=true;add.setAttribute('aria-busy','true');add.classList.add('is-saving');try{await service().add(item);if(owner===global.searchLibraryBridge.owner())feedback('Música salva na sua biblioteca.')}catch(error){if(owner===global.searchLibraryBridge.owner())feedback(error.message||'Não foi possível salvar. Tente novamente.')}finally{add.removeAttribute('aria-busy');add.classList.remove('is-saving');paint()}};
      row.append(open,add);
      if(item.kind==='local'&&global.openSongOptions){const more=document.createElement('button');more.type='button';more.className='roudy-search-local-more';more.setAttribute('aria-label','Opções de '+item.title);more.innerHTML=moreIcon();more.onclick=()=>global.openSongOptions(item.id,more);row.append(more)}
      target.append(row);
    });
  }
  async function renderResults(){
    const input=el('roudy-search-input'),target=el('roudy-search-results');if(!input||!target)return;
    const query=input.value.trim(),id=++requestId;controller?.abort();controller=new AbortController();updateClear();feedback('');
    const local=songs().filter(song=>!query||global.songSearch.normalize(song.title+' '+song.artist).includes(global.songSearch.normalize(query))).map(song=>({...song,kind:'local'}));
    renderSongs(local,query);
    if(!query){feedback(local.length?'':'Busque uma música ou artista.');return}
    if(query.length<3){feedback(local.length?'':'Digite pelo menos 3 letras para pesquisar.');return}
    feedback('Buscando músicas…');target.setAttribute('aria-busy','true');
    try{const result=await service().search(query,controller.signal);if(id!==requestId||result.stale)return;renderSongs(result.items,query);feedback(result.needsLogin?'Entre na sua conta para continuar a busca.':result.failed?'Não foi possível concluir toda a busca. Confira sua conexão e tente novamente.':result.items.length?'': 'Nenhuma música encontrada. Tente outro nome ou artista.');}
    catch(_){if(id===requestId)feedback('Não foi possível pesquisar agora. Confira sua conexão e tente novamente.')}
    finally{if(id===requestId)target.removeAttribute('aria-busy')}
  }
  function input(){clearTimeout(timer);requestId++;controller?.abort();updateClear();timer=setTimeout(renderResults,180)}
  function clear(){const input=el('roudy-search-input');if(!input)return;input.value='';renderResults();input.focus({preventScroll:true})}
  function shortcut(value){if(value==='music'){activate();return}close();setTimeout(()=>{if(value==='events')global.switchTab('setlists');else if(value==='medley')global.switchTab('medley');else{global.switchTab('musicas');global.homePlaylists?.setView('home')}},230)}
  document.addEventListener('click',event=>{const menu=event.target.closest('[data-search-song-menu]');if(menu){global.openSongOptions?.(menu.dataset.searchSongMenu,menu);return}const song=event.target.closest('[data-search-song]');if(song){const id=song.dataset.searchSong;global.savePlaylistSearch?.(el('roudy-search-input')?.value||'');close();setTimeout(()=>global.openDetail(id),230);return}const query=event.target.closest('[data-search-query]');if(query){el('roudy-search-input').value=query.dataset.searchQuery;renderResults();el('roudy-search-input').focus({preventScroll:true})}});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&el('roudy-search')?.classList.contains('is-open')){event.preventDefault();close()}});
  el('roudy-search')?.querySelector('.roudy-search-scroll')?.addEventListener('scroll',scheduleHeaderCompact,{passive:true});
  function resetAccount(){requestId++;controller?.abort();searchService=null;el('roudy-search-results')?.replaceChildren();el('roudy-search-suggestions')?.replaceChildren();if(el('roudy-search')?.classList.contains('is-open'))close()}
  global.roudySearchMenu=Object.freeze({open,close,activate,cancel,setFilter,input,clear,shortcut,expandHeaderSearch,resetAccount});
})(window);
