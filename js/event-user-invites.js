(function(global){
  'use strict';
  const byId=id=>document.getElementById(id);
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const owner=()=>global.appAuth?.getState?.().authenticated?global.appAuth.getState().user?.id:null;
  let searchSequence=0,debounce=null,selection=null,query='',nextOffset=null,results=[],invitations=[],inboxOwner=null,refreshSequence=0;
  let sheetSequence=0,sheetDebounce=null,sheetQuery='',sheetNextOffset=null,sheetResults=[],sheetEventId=null;
  function message(error){return error?.status===404?'Esta função ainda precisa ser disponibilizada no servidor.':error?.message||'Não foi possível carregar agora.';}
  function avatar(user){const url=String(user.avatarUrl||'');return url.startsWith('https://')?`<img src="${esc(url)}" alt="" referrerpolicy="no-referrer">`:`<span aria-hidden="true">${esc(user.name?.trim().slice(0,1)||'?')}</span>`;}
  function openEditor(){
    if(!owner()){global.showToast('Entre com sua conta para convidar integrantes.');return;}
    const host=document.querySelector('.event-add-member');if(!host)return;
    let panel=byId('event-user-invite-panel');
    if(panel){panel.hidden=!panel.hidden;return;}
    panel=document.createElement('section');panel.id='event-user-invite-panel';panel.className='user-invite-panel';
panel.innerHTML=`<h3>Convidar integrante</h3><p>Busque uma pessoa cadastrada ou compartilhe um convite por link.</p><label for="event-user-search">Buscar por nome ou nome de usuário</label><input id="event-user-search" class="form-input" type="search" placeholder="Nome ou @nome_de_usuario" autocomplete="off"><div id="event-user-search-status" role="status" aria-live="polite"></div><div id="event-user-results"></div><button id="event-user-more" class="btn btn-outline" type="button" hidden>Mostrar mais</button><div id="event-user-profile" hidden></div><button id="event-invite-link" class="btn btn-outline" type="button">Convidar por link</button>`;
    host.after(panel);selection=null;results=[];
    byId('event-user-search').addEventListener('input',()=>{
      clearTimeout(debounce);++searchSequence;selection=null;byId('event-user-profile').hidden=true;query=byId('event-user-search').value.trim();results=[];nextOffset=null;renderResults();
      const searchLength=query.replace(/^@+/, '').length;
      byId('event-user-search-status').textContent=searchLength<2?'Digite pelo menos 2 caracteres do nome ou nome de usuário.':'Buscando…';
      if(searchLength>=2)debounce=setTimeout(()=>search(0),300);
    });
    byId('event-user-more').addEventListener('click',()=>search(nextOffset));
    byId('event-invite-link').addEventListener('click',()=>global.eventInviteMember?.());
    byId('event-user-search').focus();
  }
  async function search(offset){
    const panel=byId('event-user-invite-panel'),seq=++searchSequence,account=owner(),term=query;if(!account||!panel)return;
    const more=byId('event-user-more');more.disabled=true;
    try{
      const data=await global.eventCollaboration.searchUsers(term,offset||0);
      if(seq!==searchSequence||account!==owner()||panel!==byId('event-user-invite-panel'))return;
      results=offset?results.concat(data.users||[]):data.users||[];nextOffset=data.nextOffset??null;renderResults();
      byId('event-user-search-status').textContent=results.length?'Selecione a pessoa para ver o perfil.':'Nenhum usuário encontrado.';
    }catch(error){if(seq===searchSequence&&account===owner()&&panel===byId('event-user-invite-panel'))byId('event-user-search-status').textContent=message(error);}
    finally{if(panel===byId('event-user-invite-panel'))more.disabled=false;}
  }
  function renderResults(){
    const host=byId('event-user-results');if(!host)return;
    host.innerHTML=results.map((user,index)=>`<button type="button" class="user-invite-result" data-user-index="${index}"><span class="user-invite-avatar">${avatar(user)}</span><span>${esc(user.name)}<small>${user.username?'@'+esc(user.username):'Perfil '+esc(String(user.id).slice(-8))}</small></span><span aria-hidden="true">›</span></button>`).join('');
    host.querySelectorAll('[data-user-index]').forEach(button=>button.addEventListener('click',()=>select(results[Number(button.dataset.userIndex)])));
    byId('event-user-more').hidden=nextOffset===null;
  }
  function select(user){
    selection=user;const panel=byId('event-user-profile');panel.hidden=false;
    panel.innerHTML=`<div class="user-invite-result"><span class="user-invite-avatar">${avatar(user)}</span><strong>${esc(user.name)}</strong></div><p>${user.username?'@'+esc(user.username):'Perfil '+esc(String(user.id).slice(-8))}. O convite será enviado para esta conta. A função musical será a selecionada acima.</p><button id="event-user-send" class="btn btn-primary" type="button">Convidar como Integrante</button><div id="event-user-send-status" role="status" aria-live="polite"></div>`;
    byId('event-user-send').addEventListener('click',send);
  }
  async function send(){
    const account=owner(),user=selection,panel=byId('event-user-invite-panel'),button=byId('event-user-send'),status=byId('event-user-send-status');if(!account||!user||!button)return;
    const role=byId('event-member-role')?.value||'Outra';button.disabled=true;
    try{
      const event=await global.saveSetlist({keepOpen:true});
      if(account!==owner()||panel!==byId('event-user-invite-panel'))return;
      if(!event||event.remoteVersion==null)throw new Error('Preencha e salve o evento na nuvem antes de convidar.');
      await global.eventCollaboration.inviteUser(event.id,user.id,role);
      if(account===owner()&&panel===byId('event-user-invite-panel')){status.textContent='Convite enviado. Aguardando aceite do integrante.';button.textContent='Convite enviado';}
    }catch(error){if(account===owner()&&panel===byId('event-user-invite-panel')){status.textContent=message(error);button.disabled=false;}}
  }
  function ensureSearchSheet(){
    let layer=byId('event-people-search-layer');if(layer)return layer;
    layer=document.createElement('div');layer.id='event-people-search-layer';layer.className='event-people-search-layer';layer.innerHTML=`<section class="event-people-search-sheet" role="dialog" aria-modal="true" aria-labelledby="event-people-search-title"><div class="event-people-search-handle" aria-hidden="true"></div><header class="event-people-search-header"><button type="button" class="event-people-search-cancel">Cancelar</button><strong id="event-people-search-title">Compartilhar com</strong><span></span></header><div class="event-people-search-box"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/></svg><input class="event-people-search-input" id="event-people-search-input" type="search" placeholder="Buscar" autocomplete="off" autocapitalize="none" spellcheck="false" aria-label="Buscar pessoa por nome ou usuário"><button class="event-people-search-clear" type="button" aria-label="Limpar busca">×</button></div><div class="event-people-search-body"><h2 class="event-people-search-heading">Pessoas</h2><p class="event-people-search-status" id="event-people-search-status" role="status" aria-live="polite">Busque por nome ou @nome_de_usuario.</p><div id="event-people-search-results"></div><button class="event-people-search-more-button" id="event-people-search-more" type="button" hidden>Mostrar mais</button></div></section>`;
    layer.addEventListener('click',event=>{if(event.target===layer)closeSearchSheet();});
    layer.querySelector('.event-people-search-cancel').addEventListener('click',closeSearchSheet);
    layer.querySelector('.event-people-search-clear').addEventListener('click',()=>{const input=byId('event-people-search-input');input.value='';input.dispatchEvent(new Event('input',{bubbles:true}));input.focus();});
    layer.querySelector('#event-people-search-more').addEventListener('click',()=>searchSheet(sheetNextOffset));
    layer.querySelector('#event-people-search-input').addEventListener('input',handleSheetInput);
    document.body.appendChild(layer);return layer;
  }
  function openSearchSheet(eventId){
    if(!owner()){global.showToast('Entre com sua conta para buscar integrantes.');return;}
    const layer=ensureSearchSheet(),input=byId('event-people-search-input');sheetEventId=String(eventId);sheetResults=[];sheetNextOffset=null;sheetQuery='';input.value='';input.closest('.event-people-search-box').classList.remove('has-value');renderSheetResults();byId('event-people-search-status').textContent='Busque por nome ou @nome_de_usuario.';requestAnimationFrame(()=>{layer.classList.add('is-open');setTimeout(()=>input.focus({preventScroll:true}),220);});
  }
  function closeSearchSheet(){
    const layer=byId('event-people-search-layer');if(layer)layer.classList.remove('is-open');clearTimeout(sheetDebounce);++sheetSequence;sheetEventId=null;sheetResults=[];sheetNextOffset=null;
  }
  function handleSheetInput(event){
    const input=event.currentTarget;clearTimeout(sheetDebounce);++sheetSequence;sheetQuery=input.value.trim();sheetResults=[];sheetNextOffset=null;input.closest('.event-people-search-box').classList.toggle('has-value',Boolean(sheetQuery));renderSheetResults();const length=sheetQuery.replace(/^@+/,'').length,status=byId('event-people-search-status');status.textContent=length<2?(length?'Digite pelo menos 2 caracteres.':'Busque por nome ou @nome_de_usuario.'):'Buscando…';if(length>=2)sheetDebounce=setTimeout(()=>searchSheet(0),300);
  }
  async function searchSheet(offset){
    const layer=byId('event-people-search-layer'),seq=++sheetSequence,account=owner(),term=sheetQuery;if(!account||!layer?.classList.contains('is-open')||!sheetEventId)return;
    const more=byId('event-people-search-more');more.disabled=true;
    try{const data=await global.eventCollaboration.searchUsers(term,offset||0);if(seq!==sheetSequence||account!==owner()||!layer.classList.contains('is-open'))return;const event=global.findEvent?.(sheetEventId),members=new Set((event?.members||[]).map(member=>String(member.id)));const incoming=(data.users||[]).filter(user=>!members.has(String(user.id)));sheetResults=offset?sheetResults.concat(incoming):incoming;sheetNextOffset=data.nextOffset??null;renderSheetResults();byId('event-people-search-status').textContent=sheetResults.length?'Selecione uma pessoa para enviar o convite.':'Nenhuma pessoa encontrada.';}
    catch(error){if(seq===sheetSequence&&account===owner()&&layer.classList.contains('is-open'))byId('event-people-search-status').textContent=message(error);}
    finally{if(more)more.disabled=false;}
  }
  function renderSheetResults(){
    const host=byId('event-people-search-results');if(!host)return;host.innerHTML=sheetResults.map((user,index)=>`<button type="button" class="event-people-search-result" data-sheet-user="${index}" aria-label="Convidar ${esc(user.name)}"><span class="event-people-search-avatar">${avatar(user)}</span><span class="event-people-search-copy"><strong>${esc(user.name)}</strong><small>${user.username?'@'+esc(user.username):'Perfil '+esc(String(user.id).slice(-8))}</small></span><span class="event-people-search-more" aria-hidden="true">•••</span></button>`).join('');host.querySelectorAll('[data-sheet-user]').forEach(button=>button.addEventListener('click',()=>inviteFromSheet(sheetResults[Number(button.dataset.sheetUser)],button)));const more=byId('event-people-search-more');if(more)more.hidden=sheetNextOffset===null;
  }
  async function inviteFromSheet(user,button){
    const account=owner(),eventId=sheetEventId,status=byId('event-people-search-status');if(!account||!eventId||!user||button.disabled)return;if(global.appConfirm&&!global.appConfirm(`Adicionar ${user.name} ao evento?`))return;button.disabled=true;status.textContent=`Enviando convite para ${user.name}…`;
    try{await global.eventCollaboration.inviteUser(eventId,user.id,'Outra');if(account!==owner()||eventId!==sheetEventId)return;button.querySelector('.event-people-search-more').textContent='✓';button.setAttribute('aria-label',`${user.name}: convite enviado`);status.textContent='Convite enviado. A pessoa entrará no evento após aceitar.';}
    catch(error){if(account===owner()&&eventId===sheetEventId){button.disabled=false;status.textContent=message(error);}}
  }
  function updateBadge(){if(global.notificationCenter){global.notificationCenter.update();return;}const button=byId('user-invitations-button');if(!button)return;button.hidden=!owner();button.querySelector('.event-notification-badge')?.remove();if(invitations.length){const badge=document.createElement('span');badge.className='event-notification-badge';badge.textContent=invitations.length>99?'99+':String(invitations.length);button.appendChild(badge);}button.setAttribute('aria-label',`Convites para eventos${invitations.length?': '+invitations.length+' pendentes':''}`);}
  async function refresh(showError=false){
    const account=owner(),seq=++refreshSequence;if(!account){invitations=[];inboxOwner=null;updateBadge();return;}
    if(inboxOwner!==account){invitations=[];inboxOwner=account;}updateBadge();
    if(navigator.onLine===false){if(showError&&byId('user-invitations-status'))byId('user-invitations-status').textContent='Conecte-se à internet para consultar seus convites.';return;}
    try{
      const body=await global.eventCollaboration.listInvitations();if(seq!==refreshSequence||account!==owner())return;
      invitations=body.invitations||[];updateBadge();if(byId('user-invitations-list'))renderInbox();
    }catch(error){if(showError&&seq===refreshSequence&&account===owner()&&byId('user-invitations-status'))byId('user-invitations-status').textContent=message(error);}
  }
  function openInbox(){
    if(global.notificationCenter){global.notificationCenter.open();return;}
    if(!owner()){global.showToast('Entre com sua conta para consultar convites.');return;}
    global.closeModal();
    byId('modal-body').innerHTML='<div class="modal-title">Convites para eventos</div><div id="user-invitations-status" role="status" aria-live="polite">Carregando…</div><div id="user-invitations-list"></div><button id="user-invitations-close" class="btn btn-outline" type="button">Fechar</button>';
    byId('user-invitations-close').addEventListener('click',global.closeModal);byId('modal-overlay').style.display='flex';refresh(true);
  }
  function renderInbox(){
    byId('user-invitations-status').textContent=invitations.length?'Escolha aceitar ou rejeitar cada convite.':'Você não tem convites pendentes.';
    byId('user-invitations-list').innerHTML=invitations.map((item,index)=>`<section class="user-invite-panel"><h3>${esc(item.eventTitle)}</h3><p>${esc(item.inviter?.name||'Líder')} convidou você${item.eventDate?' para '+esc(item.eventDate):''} como ${esc(item.role)}.</p><small>Ao aceitar, você entra como integrante, sem permissões de líder.${item.bandName?` Também participará da equipe ${esc(item.bandName)}.`:''}</small><div class="user-invite-actions"><button class="btn btn-primary" type="button" data-invitation-index="${index}" data-action="accept">Aceitar</button><button class="btn btn-outline" type="button" data-invitation-index="${index}" data-action="reject">Rejeitar</button></div><div role="status" aria-live="polite"></div></section>`).join('');
    byId('user-invitations-list').querySelectorAll('[data-action]').forEach(button=>button.addEventListener('click',()=>respond(invitations[Number(button.dataset.invitationIndex)],button.dataset.action,button)));
  }
  async function respond(invitation,action,button){
    const account=owner(),list=byId('user-invitations-list');if(!invitation||!account)return;
    const card=button.closest('section'),status=card.querySelector('[role=status]');card.querySelectorAll('button').forEach(b=>b.disabled=true);
    try{
      const result=await global.eventCollaboration.respondInvitation(invitation.id,action);if(account!==owner())return;
      if(result.event)global.receiveInvitedEvent?.(result.event);
      invitations=invitations.filter(item=>item.id!==invitation.id);updateBadge();if(list===byId('user-invitations-list'))renderInbox();
      global.showToast(action==='accept'?'Convite aceito. O evento está na sua lista.':'Convite rejeitado.');
    }catch(error){if(account===owner()&&list===byId('user-invitations-list')){status.textContent=message(error);card.querySelectorAll('button').forEach(b=>b.disabled=false);}}
  }
  global.eventUserInvites=Object.freeze({openEditor,openSearchSheet,closeSearchSheet,openInbox,refresh,renderInbox,getPending:()=>inboxOwner===owner()?invitations.slice():[]});
  global.appAuth?.subscribe(()=>{++searchSequence;clearTimeout(debounce);selection=null;refresh();});
  global.addEventListener('focus',()=>refresh());global.addEventListener('online',()=>refresh());
  setInterval(()=>{if(!document.hidden)refresh();},45000);
})(window);
