(function(global){
  'use strict';
  const key='sc_notification_center_read_v1',el=id=>document.getElementById(id);
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const scope=()=>global.getRoudyNotificationScope();
  function readState(){const value=global.storage.get(key,{});return value&&typeof value==='object'&&!Array.isArray(value)?value:{};}
  const seen=()=>new Set(Array.isArray(readState()[scope()])?readState()[scope()].filter(id=>typeof id==='string'):[]);
  const pending=()=>global.eventUserInvites.getPending();
  const items=()=>global.getRoudyNotificationItems().sort((a,b)=>(Date.parse(b.createdAt)||0)-(Date.parse(a.createdAt)||0)||a.id.localeCompare(b.id));
  function saveRead(ids){const all=readState();return global.storage.set(key,{...all,[scope()]:[...new Set([...seen(),...ids])]})!==false;}
  function update(){
    const button=el('user-invitations-button');if(!button)return;
    const read=seen(),count=pending().filter(i=>!read.has('invite:'+i.id)).length+items().filter(i=>i.unread&&!read.has(i.id)).length;
    button.hidden=false;button.innerHTML=`🔔${count?`<span class="event-notification-badge">${count>99?'99+':count}</span>`:''}`;
    button.setAttribute('aria-label',count?`Notificações: ${count} não lidas`:'Notificações');
    if(el('roudy-notification-items'))render();
  }
  function render(){
    const target=el('roudy-notification-items');if(!target)return;
    const read=seen(),feed=items();
    target.innerHTML=feed.map((item,index)=>`<section class="user-invite-panel notification-card ${item.unread&&!read.has(item.id)?'notification-unread':''}"><small>${item.kind==='message'?'💬 Mensagem / Enquete':'📅 Alteração de evento'}${item.unread&&!read.has(item.id)?' · Não lida':''}</small><h3>${esc(item.title)}</h3><p>${esc(item.summary)}</p><small>${esc(formatDate(item.createdAt))}</small><button class="btn btn-outline" type="button" data-notification-index="${index}">${item.kind==='message'?'Abrir conversa':'Ver evento'}</button></section>`).join('')||'<p class="event-notification-empty">Nenhuma alteração ou mensagem por aqui.</p>';
    target.querySelectorAll('[data-notification-index]').forEach(button=>button.addEventListener('click',async()=>{
      const item=feed[Number(button.dataset.notificationIndex)];
      if(!saveRead([item.id]))global.showToast('Não foi possível registrar a leitura neste dispositivo.');
      else global.readRoudyNotification(item);
      update();await global.openRoudyNotification(item);
    }));
    global.eventUserInvites.renderInbox();
    el('notification-mark-all').disabled=!pending().some(i=>!read.has('invite:'+i.id))&&!feed.some(i=>i.unread&&!read.has(i.id));
  }
  function formatDate(value){const date=new Date(value);return Number.isFinite(date.getTime())?date.toLocaleString():'';}
  function markAll(){
    const feed=items();if(!saveRead([...feed.map(i=>i.id),...pending().map(i=>'invite:'+i.id)])){global.showToast('Não foi possível registrar a leitura neste dispositivo.');return;}
    feed.forEach(i=>global.readRoudyNotification(i));update();global.showToast('Notificações marcadas como lidas. Os convites continuam aguardando sua resposta.');
  }
  function markChatRead(eventId){saveRead(items().filter(i=>i.kind==='message'&&String(i.eventId)===String(eventId)).map(i=>i.id));update();}
  function open(){
    global.closeModal();
    el('modal-body').innerHTML='<div class="modal-title">Notificações</div><button id="notification-mark-all" class="btn btn-outline" type="button">Marcar todas como lidas</button><h3 class="event-section-title">Convites</h3><div id="user-invitations-status" role="status" aria-live="polite"></div><div id="user-invitations-list"></div><h3 class="event-section-title">Alterações, mensagens e enquetes</h3><div id="roudy-notification-items"></div><button id="notification-center-close" class="btn btn-outline" type="button">Fechar</button>';
    el('notification-mark-all').addEventListener('click',markAll);el('notification-center-close').addEventListener('click',global.closeModal);
    el('modal-overlay').style.display='flex';update();global.eventUserInvites.refresh(true);
  }
  global.notificationCenter=Object.freeze({open,update,markChatRead});
  global.appAuth.subscribe(()=>{if(el('roudy-notification-items'))global.closeModal();update();});
  global.addEventListener('storage',()=>update());update();
})(window);
