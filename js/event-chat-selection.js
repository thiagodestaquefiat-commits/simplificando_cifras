// Message selection delegates deletion/hiding to the existing chat/account rules.
(function(global){
 'use strict';
 const root=document.getElementById('event-chat-view'),context=()=>global.eventChatSelectionContext;
 if(!root)return;
 let active=false,eventId=null,userId=null,selected=new Set(),sheet=null,previousFocus=null;
 let undoNotice=null,undoTimer=0,undoObserver=null;
 const UNDO_NOTICE_MS=8000;
 function clearUndo(){clearTimeout(undoTimer);undoObserver?.disconnect();undoObserver=null;undoNotice?.remove();undoNotice=null;}
 function offerUndo(ids,event,user){
  clearUndo();undoNotice=document.createElement('div');undoNotice.className='event-chat-delete-undo';
  undoNotice.innerHTML='<span role="status" aria-live="polite"></span><button type="button">Desfazer</button>';
  undoNotice.querySelector('span').textContent=ids.length===1?'Mensagem apagada para mim':'Mensagens apagadas para mim';
  const expire=()=>{clearTimeout(undoTimer);undoTimer=setTimeout(clearUndo,UNDO_NOTICE_MS);};
  const position=()=>{const composer=root.querySelector('.event-chat-composer');undoNotice?.style.setProperty('bottom',((composer?.getBoundingClientRect().height||64)+12)+'px');};
  undoNotice.addEventListener('pointerenter',()=>clearTimeout(undoTimer));undoNotice.addEventListener('pointerleave',expire);
  undoNotice.addEventListener('focusin',()=>clearTimeout(undoTimer));undoNotice.addEventListener('focusout',expire);
  undoNotice.querySelector('button').onclick=()=>{
   if(String(context().eventId())!==event||String(context().userId())!==user||root.hidden)return clearUndo();
   if(context().restore(ids)===false){context().notify('Não foi possível desfazer. Tente novamente.');return;}
   clearUndo();context().render();
  };
  root.append(undoNotice);position();if(global.ResizeObserver){undoObserver=new ResizeObserver(position);const composer=root.querySelector('.event-chat-composer');if(composer)undoObserver.observe(composer);}expire();
 }
 const trash='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/></svg>';
 const cancelButton=document.createElement('button');cancelButton.type='button';cancelButton.className='event-chat-selection-cancel';cancelButton.textContent='Cancelar';cancelButton.hidden=true;cancelButton.onclick=cancel;root.querySelector('.event-chat-header').append(cancelButton);
 const toolbar=document.createElement('footer');toolbar.className='event-chat-selection-toolbar';toolbar.hidden=true;toolbar.innerHTML='<button type="button" aria-label="Apagar mensagens selecionadas">'+trash+'</button><span role="status" aria-live="polite"></span>';toolbar.querySelector('button').onclick=confirm;root.append(toolbar);
 function valid(){return String(context().eventId())===eventId&&String(context().userId())===userId;}
 function messages(){return context().messages().filter(message=>message.type!=='system'&&!message.deleted);}
 function chosen(){return messages().filter(message=>selected.has(String(message.id)));}
 function closeSheet(){if(!sheet)return;sheet.remove();sheet=null;previousFocus?.isConnected&&previousFocus.focus({preventScroll:true});}
 function cancel(){clearUndo();closeSheet();active=false;selected.clear();eventId=userId=null;root.classList.remove('is-selecting-messages');cancelButton.hidden=toolbar.hidden=true;root.querySelectorAll('.event-chat-selection-check').forEach(button=>button.remove());root.querySelectorAll('.is-message-selected').forEach(row=>row.classList.remove('is-message-selected'));}
 function refresh(){
  if(!active)return;if(!valid()){cancel();return;}
  const available=new Map(messages().map(message=>[String(message.id),message]));selected=new Set([...selected].filter(id=>available.has(id)));
  root.querySelectorAll('.event-message[data-message-id]').forEach(row=>{
   const id=row.dataset.messageId;if(!available.has(id)){row.querySelector('.event-chat-selection-check')?.remove();row.classList.remove('is-message-selected');return;}
   let check=row.querySelector('.event-chat-selection-check');if(!check){check=document.createElement('button');check.type='button';check.className='event-chat-selection-check';check.setAttribute('role','checkbox');check.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4 10-10"/></svg>';row.prepend(check);}
   check.setAttribute('aria-label','Selecionar mensagem de '+available.get(id).sender.name);check.setAttribute('aria-checked',String(selected.has(id)));row.classList.toggle('is-message-selected',selected.has(id));
  });
  toolbar.querySelector('span').textContent=selected.size+' '+(selected.size===1?'selecionada':'selecionadas');toolbar.querySelector('button').disabled=!selected.size;
 }
 function start(id){cancel();if(!id)return;context().prepare();active=true;eventId=String(context().eventId());userId=String(context().userId());selected.add(String(id));root.classList.add('is-selecting-messages');cancelButton.hidden=toolbar.hidden=false;refresh();root.querySelector('.is-message-selected .event-chat-selection-check')?.focus({preventScroll:true});}
 function toggle(id){if(!active||!valid())return cancel();if(!messages().some(message=>String(message.id)===String(id)))return;if(selected.has(id))selected.delete(id);else selected.add(id);refresh();}
 async function apply(everyone){
  if(!active||!valid())return cancel();const items=chosen();if(!items.length)return closeSheet();
  if(everyone&&!items.every(message=>!message.deleted&&String(message.sender.id)===userId))return closeSheet();
  const deletedEvent=eventId,deletedUser=userId,ids=items.map(message=>String(message.id));
  try{if(everyone)items.forEach(message=>context().remove(message.id));else if(context().hide(ids)===false)throw Error('Não foi possível apagar neste aparelho. Tente novamente.');cancel();context().render();if(!everyone)offerUndo(ids,deletedEvent,deletedUser);}
  catch(error){closeSheet();refresh();context().notify(error.message||'Não foi possível apagar. Tente novamente.');}
 }
 function confirm(){
  if(!active||!valid())return cancel();const items=chosen();if(!items.length)return;
  closeSheet();previousFocus=document.activeElement;sheet=document.createElement('div');sheet.className='event-chat-delete-layer';
  sheet.innerHTML='<button type="button" class="event-chat-delete-backdrop" aria-label="Cancelar exclusão"></button><section class="event-chat-delete-sheet" role="dialog" aria-modal="true" aria-labelledby="event-chat-delete-title"><header><h2 id="event-chat-delete-title">'+(items.length===1?'Deseja apagar esta mensagem?':'Deseja apagar estas mensagens?')+'</h2><button type="button" class="event-chat-delete-close" aria-label="Cancelar exclusão">×</button></header><div class="event-chat-delete-choices">'+(items.every(message=>!message.deleted&&String(message.sender.id)===userId)?'<button type="button" data-delete-everyone>Apagar para todos</button>':'')+'<button type="button" data-delete-self>Apagar para mim</button></div></section>';
  sheet.querySelector('.event-chat-delete-backdrop').onclick=closeSheet;sheet.querySelector('.event-chat-delete-close').onclick=closeSheet;sheet.querySelector('[data-delete-everyone]')?.addEventListener('click',()=>apply(true));sheet.querySelector('[data-delete-self]').onclick=()=>apply(false);root.append(sheet);sheet.querySelector('.event-chat-delete-close').focus();
 }
 const list=root.querySelector('#event-chat-messages');
 list.addEventListener('click',event=>{if(!active)return;const row=event.target.closest('.event-message[data-message-id]');if(!row||!row.querySelector('.event-chat-selection-check'))return;event.preventDefault();event.stopImmediatePropagation();toggle(row.dataset.messageId);},true);
 list.addEventListener('contextmenu',event=>{if(active){event.preventDefault();event.stopImmediatePropagation();}},true);
 list.addEventListener('pointerdown',event=>{if(active)event.stopImmediatePropagation();},true);
 list.addEventListener('keydown',event=>{if(!active||!['Enter',' '].includes(event.key))return;const row=event.target.closest('.event-message[data-message-id]');if(row){event.preventDefault();event.stopImmediatePropagation();toggle(row.dataset.messageId);}},true);
 document.addEventListener('keydown',event=>{if(!active)return;if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();sheet?closeSheet():cancel();}else if(sheet&&event.key==='Tab'){const buttons=[...sheet.querySelectorAll('section button')],first=buttons[0],last=buttons.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}},true);
 global.eventChatSelection=Object.freeze({start,cancel,refresh,confirm});
})(window);
