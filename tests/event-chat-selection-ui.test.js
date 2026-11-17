const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{
 const page=await browser.newPage({viewport:{width:390,height:844}});
 await page.setContent('<section id="event-chat-view"><header class="event-chat-header"><button class="event-chat-back">Voltar</button><div>Evento</div></header><main id="event-chat-messages"></main><footer class="event-chat-composer">Mensagem</footer></section>');
 await page.addStyleTag({path:'js/event-detail-refactor.css'});
 await page.addStyleTag({content:'#event-chat-view{position:fixed;inset:0;display:flex;flex-direction:column;background:#0b0b0c;color:white}#event-chat-messages{flex:1;min-height:0;overflow:auto;padding:130px 16px 20px}.event-message{display:flex;margin-block:12px}.event-message-bubble{padding:12px;background:#252526;border-radius:18px}.event-message.mine .event-message-bubble{background:#04488f}'});
 await page.evaluate(()=>{
  window.__items=[{id:'1',sender:{id:'me',name:'Você'},type:'text'},{id:'2',sender:{id:'other',name:'Outro'},type:'text'},{id:'3',sender:{id:'me',name:'Você'},type:'text'},{id:'4',sender:{id:'me',name:'Você'},type:'text',deleted:true}];window.__hidden=[];window.__removed=[];
  const render=()=>{document.querySelector('#event-chat-messages').innerHTML=window.__items.filter(m=>!window.__hidden.includes(m.id)).map(m=>'<article class="event-message '+(m.sender.id==='me'?'mine':'')+'" data-message-id="'+m.id+'"><div class="event-message-stack"><div class="event-message-bubble">Mensagem '+m.id+'</div></div></article>').join('');window.eventChatSelection?.refresh();};
  window.eventChatSelectionContext={eventId:()=> 'event',userId:()=> 'me',messages:()=>window.__items,prepare:()=>{},notify:()=>{},render,restore:ids=>{window.__hidden=window.__hidden.filter(id=>!ids.includes(id));return true;},hide:ids=>{window.__hidden.push(...ids);return true;},remove:id=>{window.__removed.push(id);window.__items.find(m=>m.id===id).deleted=true;render();}};render();
 });
 await page.addScriptTag({path:'js/event-chat-selection.js'});
 await page.evaluate(()=>eventChatSelection.start('1'));
 assert.equal(await page.getByRole('checkbox',{checked:true}).count(),1);
 await page.getByRole('button',{name:'Apagar mensagens selecionadas'}).click();
 assert.equal(await page.getByRole('button',{name:'Apagar para todos',exact:true}).count(),1);
 await page.locator('.event-chat-delete-close').click();assert.equal(await page.getByRole('dialog').count(),0);
 await page.locator('[data-message-id="2"] .event-message-bubble').click();
 await page.getByRole('button',{name:'Apagar mensagens selecionadas'}).click();
 assert.equal(await page.getByRole('button',{name:'Apagar para todos',exact:true}).count(),0);
 await page.getByRole('button',{name:'Apagar para mim',exact:true}).click();
 assert.deepEqual(await page.evaluate(()=>window.__hidden),['1','2']);assert.deepEqual(await page.evaluate(()=>window.__removed),[]);
 await page.getByRole('button',{name:'Desfazer',exact:true}).click();assert.deepEqual(await page.evaluate(()=>window.__hidden),[]);assert.equal(await page.locator('.event-chat-delete-undo').count(),0);
 assert.equal(await page.locator('[data-message-id="4"] .event-chat-selection-check').count(),0,'deleted messages have no selection control');
 await page.evaluate(()=>eventChatSelection.start('3'));
 await page.getByRole('button',{name:'Apagar mensagens selecionadas'}).click();
 await page.getByRole('button',{name:'Apagar para todos',exact:true}).click();assert.deepEqual(await page.evaluate(()=>window.__removed),['3']);assert.equal(await page.locator('.event-chat-delete-undo').count(),0,'no undo for deleting for everyone');
 assert.equal(await page.locator('#event-chat-view').evaluate(e=>e.classList.contains('is-selecting-messages')),false);
 console.log('event-chat-selection-ui.test.js: OK (selection, cancel, ownership, hide, delete)');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
