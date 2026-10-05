(function(global){
  'use strict';
  const byId=id=>document.getElementById(id);
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const owner=()=>global.appAuth?.getState?.().authenticated?global.appAuth.getState().user?.id:null;
  let searchSequence=0,debounce=null,selection=null,query='',nextOffset=null,results=[],invitations=[],inboxOwner=null,refreshSequence=0;
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
  function updateBadge(){if(global.notificationCenter){global.notificationCenter.update();return;}const button=byId('user-invitations-button');if(!button)return;button.hidden=!owner();button.textContent=invitations.length?`🔔 ${invitations.length}`:'🔔';button.setAttribute('aria-label',`Convites para eventos${invitations.length?': '+invitations.length+' pendentes':''}`);}
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
  global.eventUserInvites=Object.freeze({openEditor,openInbox,refresh,renderInbox,getPending:()=>inboxOwner===owner()?invitations.slice():[]});
  global.appAuth?.subscribe(()=>{++searchSequence;clearTimeout(debounce);selection=null;refresh();});
  global.addEventListener('focus',()=>refresh());global.addEventListener('online',()=>refresh());
  setInterval(()=>{if(!document.hidden)refresh();},45000);
})(window);
