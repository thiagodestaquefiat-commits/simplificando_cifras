const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  const file = path.resolve(root, pathname === '/' ? 'index.html' : decodeURIComponent(pathname.slice(1)));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return response.writeHead(404).end();
  response.setHeader('Content-Type', ({ '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' })[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(response);
});



(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{
 const page=await browser.newPage({viewport:{width:390,height:844},serviceWorkers:'block'}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/api/**',route=>route.fulfill({status:200,contentType:'application/json',body:'{}'}));
 await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({status:200,contentType:'text/css',body:''}));
 await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.eventChatSelection&&typeof continueWithoutLogin==='function');
 await page.evaluate(()=>{
  continueWithoutLogin();const user={id:String(appCurrentUser.id),name:'Você'};
  setlists=[eventModel.create({id:'selection-fixture',title:'Ensaio',leaderId:user.id,members:[{...user,role:'Liderança',isLeader:true}],repertoire:[]})];currentSdId='selection-fixture';
  window.__selectionMessages=[{id:'one',type:'text',sender:user,content:'Teste',createdAt:new Date().toISOString(),readBy:[]},{id:'two',type:'text',sender:user,content:'Mais uma mensagem',createdAt:new Date().toISOString(),readBy:[]},{id:'deleted',type:'text',sender:user,content:'',deleted:true,createdAt:new Date().toISOString(),readBy:[]}];
  window.eventChat={list:()=>window.__selectionMessages,markRead:()=>{},remove:id=>{},};
  document.querySelector('#event-chat-title').textContent='Ensaio';document.querySelector('#event-chat-view').hidden=false;renderEventChatMessages(false);
  const row=document.querySelector('[data-message-id="one"]');openEventChatContext(window.__selectionMessages[0],row,row.querySelector('.event-message-bubble'));
 });
 if(process.env.REVIEW_CONTEXT_SCREENSHOT)await page.screenshot({path:process.env.REVIEW_CONTEXT_SCREENSHOT});
 await page.waitForTimeout(200);const bounds=await page.evaluate(()=>({menu:document.querySelector('.event-chat-context-menu').getBoundingClientRect().toJSON(),bubble:document.querySelector('[data-message-id=one] .event-message-bubble').getBoundingClientRect().toJSON(),emojis:document.querySelector('.event-chat-context-reactions').getBoundingClientRect().toJSON()}));
 assert.ok(bounds.menu.top>=bounds.bubble.bottom,'menu is below pressed message');assert.ok(bounds.emojis.bottom<=bounds.bubble.top,'emoji bar is above message '+JSON.stringify(bounds));assert.ok(bounds.emojis.top>=0&&bounds.menu.bottom<=844,'actions remain in viewport');assert.equal(await page.getByRole('button',{name:'Reagir com ❤️',exact:true}).isVisible(),true);
 await page.locator('.event-chat-delete-action').click();
 assert.equal(await page.getByRole('checkbox',{checked:true}).count(),1);assert.equal(await page.getByRole('checkbox').count(),2,'deleted message must not be selectable');assert.equal(await page.locator('[data-message-id=deleted] .event-chat-selection-check').count(),0);
 assert.equal(await page.locator('.event-chat-composer').isVisible(),false);
 await page.locator('[data-message-id="two"] .event-message-bubble').click();
 assert.equal(await page.getByRole('checkbox',{checked:true}).count(),2);
 await page.getByRole('button',{name:'Apagar mensagens selecionadas'}).click();
 assert.equal(await page.getByRole('dialog',{name:'Deseja apagar estas mensagens?'}).isVisible(),true);
 if(process.env.REVIEW_SCREENSHOT)await page.screenshot({path:process.env.REVIEW_SCREENSHOT});
 await page.locator('.event-chat-delete-close').click();await page.getByRole('button',{name:'Cancelar',exact:true}).click();
 assert.equal(await page.locator('.event-chat-composer').isVisible(),true);
 await page.evaluate(()=>eventChatSelection.start('one'));await page.getByRole('button',{name:'Apagar mensagens selecionadas'}).click();await page.getByRole('button',{name:'Apagar para mim',exact:true}).click();
 assert.equal(await page.locator('[data-message-id=one]').count(),0);await page.getByRole('button',{name:'Desfazer',exact:true}).click();assert.equal(await page.locator('[data-message-id=one]').count(),1);assert.deepEqual(errors,[]);
 console.log('event-chat-selection-page-ui.test.js: OK (full page context menu, multi-select, sheet, cancel, composer restoration)');
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;server.close();});
