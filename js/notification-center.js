(function(global){
  'use strict';
  const key='sc_notification_center_read_v1',el=id=>document.getElementById(id);
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const scope=()=>typeof global.getRoudyNotificationScope==='function'?global.getRoudyNotificationScope():'local';
  function readState(){const value=global.storage.get(key,{});return value&&typeof value==='object'&&!Array.isArray(value)?value:{};}
  const seen=()=>new Set(Array.isArray(readState()[scope()])?readState()[scope()].filter(id=>typeof id==='string'):[]);
  const pending=()=>global.eventUserInvites?.getPending?.()||[];
  const items=()=>{
    const values=typeof global.getRoudyNotificationItems==='function'?global.getRoudyNotificationItems():[];
    return (Array.isArray(values)?values:[]).slice().sort((a,b)=>(Date.parse(b.createdAt)||0)-(Date.parse(a.createdAt)||0)||String(a.id).localeCompare(String(b.id)));
  };
  function initials(value){const word=String(value||'ROUDY').trim().split(/\s+/)[0];return Array.from(word)[0]?.toLocaleUpperCase('pt-BR')||'R';}
  function period(value){const date=new Date(value),now=new Date(),start=new Date(now.getFullYear(),now.getMonth(),now.getDate()),day=new Date(date.getFullYear(),date.getMonth(),date.getDate()),distance=Math.floor((start-day)/86400000);if(distance<=0)return 'Hoje';if(distance===1)return 'Ontem';if(distance<7)return 'Últimos 7 dias';return 'Anteriores';}
  function relativeDate(value){const date=new Date(value),seconds=Math.max(0,Math.floor((Date.now()-date.getTime())/1000));if(!Number.isFinite(seconds))return '';if(seconds<60)return 'agora';if(seconds<3600)return Math.floor(seconds/60)+' min';if(seconds<86400)return Math.floor(seconds/3600)+' h';if(seconds<604800)return Math.floor(seconds/86400)+' d';return date.toLocaleDateString('pt-BR',{day:'2-digit',month:'short'}).replace('.','');}
  function saveRead(ids){const all=readState();return global.storage.set(key,{...all,[scope()]:[...new Set([...seen(),...ids])]})!==false;}
  function update(){
    const button=el('user-invitations-button');if(!button)return;
    const read=seen(),count=pending().filter(i=>!read.has('invite:'+i.id)).length+items().filter(i=>i.unread&&!read.has(i.id)).length;
    if(!button.querySelector('svg'))button.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 8.5h18C21 15 18 15 18 8Z"></path><path d="M9.5 20h5"></path></svg>';
    button.hidden=false;button.querySelector('.event-notification-badge')?.remove();
    if(count){const badge=document.createElement('span');badge.className='event-notification-badge';badge.textContent=count>99?'99+':String(count);button.appendChild(badge);}
    button.setAttribute('aria-label',count?`Notificações: ${count} não lidas`:'Notificações');
    if(el('roudy-notification-items'))render();
  }
  function render(){
    const target=el('roudy-notification-items');if(!target)return;
    const read=seen(),feed=items();
    let activePeriod='';target.innerHTML=feed.map((item,index)=>{const group=period(item.createdAt),heading=group!==activePeriod?`<h2 class="notification-period">${group}</h2>`:'';activePeriod=group;const unread=item.unread&&!read.has(item.id),name=item.actorName||item.senderName||item.title,palette=global.eventAvatarPaletteClass?.(item.actorId||item.senderId||name)||'roudy-avatar-tone-0';return `${heading}<button class="notification-row ${unread?'notification-unread':''}" type="button" data-notification-index="${index}"><span class="notification-avatar ${palette}${item.avatarUrl?' has-image':''}">${item.avatarUrl?`<img src="${esc(item.avatarUrl)}" alt="">`:esc(initials(name))}${unread?'<i aria-hidden="true"></i>':''}</span><span class="notification-copy"><strong>${esc(item.title)}</strong><span>${esc(item.summary)} <time datetime="${esc(item.createdAt)}">${esc(relativeDate(item.createdAt))}</time></span><small>${item.kind==='message'?'Abrir conversa':'Ver evento'}</small></span></button>`;}).join('')||'<p class="event-notification-empty">Nenhuma alteração ou mensagem por aqui.</p>';
    target.querySelectorAll('[data-notification-index]').forEach(button=>button.addEventListener('click',async()=>{
      const item=feed[Number(button.dataset.notificationIndex)];
      if(!saveRead([item.id]))global.showToast('Não foi possível registrar a leitura neste dispositivo.');
      else global.readRoudyNotification?.(item);
      update();if(typeof global.openRoudyNotification==='function')await global.openRoudyNotification(item);
    }));
    global.eventUserInvites?.renderInbox?.();
    el('notification-mark-all').disabled=!pending().some(i=>!read.has('invite:'+i.id))&&!feed.some(i=>i.unread&&!read.has(i.id));
  }
  function formatDate(value){const date=new Date(value);return Number.isFinite(date.getTime())?date.toLocaleString():'';}
  function markAll(){
    const feed=items();if(!saveRead([...feed.map(i=>i.id),...pending().map(i=>'invite:'+i.id)])){global.showToast('Não foi possível registrar a leitura neste dispositivo.');return;}
    feed.forEach(i=>global.readRoudyNotification?.(i));update();global.showToast('Notificações marcadas como lidas. Os convites continuam aguardando sua resposta.');
  }
  function markChatRead(eventId){saveRead(items().filter(i=>i.kind==='message'&&String(i.eventId)===String(eventId)).map(i=>i.id));update();}
  function open(){
    global.closeModal();
    el('modal-overlay').classList.add('notification-center-overlay');
    el('modal-body').innerHTML='<section class="notification-center-page"><header class="notification-center-header"><button id="notification-center-close" class="notification-center-back" type="button" aria-label="Voltar">‹</button><h1>Notificações</h1><button id="notification-mark-all" class="notification-mark-all" type="button">Ler todas</button></header><main class="notification-center-content"><section class="notification-invitations"><h2 class="notification-period">Convites</h2><div id="user-invitations-status" role="status" aria-live="polite"></div><div id="user-invitations-list"></div></section><div id="roudy-notification-items"></div></main></section>';
    el('notification-mark-all').addEventListener('click',markAll);el('notification-center-close').addEventListener('click',global.closeModal);
    el('modal-overlay').style.display='flex';update();global.eventUserInvites?.refresh?.(true);
  }
  global.notificationCenter=Object.freeze({open,update,markChatRead});
  global.appAuth?.subscribe?.(()=>{if(el('roudy-notification-items'))global.closeModal();update();});
  global.addEventListener('storage',()=>update());
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',update,{once:true});else update();
})(window);
