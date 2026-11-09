const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{const p=new URL(req.url,'http://localhost').pathname,file=path.resolve(root,p==='/'?'index.html':decodeURIComponent(p.slice(1)));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return res.writeHead(404).end();res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'}[path.extname(file)]||'application/octet-stream')+'; charset=utf-8'});fs.createReadStream(file).pipe(res);});
(async()=>{let browser;try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  const page=await browser.newPage({viewport:{width:390,height:844},serviceWorkers:'block'}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({contentType:'text/css',body:''}));
  await page.route('**/api/**',route=>route.fulfill({status:200,json:{}}));
  await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:'domcontentloaded'});
  await page.getByRole('button',{name:'Continuar sem login'}).click();
  const unread=await page.evaluate(()=>{
    const event=eventModel.create({id:'history-test',title:'Ensaio',leaderId:appCurrentUser.id,members:[{id:appCurrentUser.id,name:'Eu'}]});setlists=[event];
    const old=Array.from({length:1200},(_,i)=>({id:'old-'+i,createdAt:'2020-01-01T00:00:00.000Z',sender:{id:'other',name:'Outro'},content:'Anterior'}));
    storage.set('sc_event_messages_v1',{'history-test':old});eventChat.markRead('history-test');
    storage.set('sc_event_messages_v1',{'history-test':[...old,{id:'new',createdAt:new Date(Date.now()+1000).toISOString(),sender:{id:'other',name:'Outro'},content:'Nova'}]});
    return getRoudyNotificationItems().filter(i=>i.unread).map(i=>i.id);
  });
  assert.deepEqual(unread,['message:history-test:new'],'uma mensagem nova não reativa 1200 mensagens antigas');
  const eventRead=await page.evaluate(()=>{
    const event=setlists[0];
    event.notifications=Array.from({length:80},(_,i)=>({id:'change-'+i,actorId:'other',actorName:'Outro',summary:'Alterou o evento',createdAt:'2026-01-01T00:00:00Z'}));
    eventChat.markRead(event.id);
    notificationCenter.markChatRead(event.id);
    markEventNoticesRead(event);
    const afterRead=eventUnreadNotices(event).length;
    event.notifications.push({id:'latest-change',actorId:'other',actorName:'Outro',summary:'Nova alteração',createdAt:new Date().toISOString()});
    const afterNew=eventUnreadNotices(event).map(n=>n.id);
    notificationCenter.dismiss('event:'+event.id+':latest-change');
    const afterDismiss=eventUnreadNotices(event).length;
    currentSdId=event.id;openEventNotifications();
    return {afterRead,afterNew,afterDismiss,badge:!!document.querySelector('#user-invitations-button .event-notification-badge')};
  });
  assert.deepEqual(eventRead,{afterRead:0,afterNew:['latest-change'],afterDismiss:0,badge:false},'histórico do evento, central e sino mantêm a mesma leitura');
  await page.evaluate(()=>{
    window.testFeed=Array.from({length:1300},(_,i)=>({id:'notice-'+i,kind:'event',eventId:'absent',title:'Outro',summary:'Ajustou a música',createdAt:'2026-01-01T00:00:00Z',unread:true}));
    window.getRoudyNotificationItems=()=>testFeed;
    notificationCenter.open();
  });
  await page.getByRole('button',{name:'Ler todas',exact:true}).click();
  assert.equal(await page.locator('#user-invitations-button .event-notification-badge').count(),0,'ler todas preserva mais de mil IDs');
  await page.evaluate(()=>{testFeed.push({...testFeed[0],id:'notice-new'});notificationCenter.update();});
  assert.equal(await page.locator('#user-invitations-button .event-notification-badge').textContent(),'1','apenas a alteração nova volta ao contador');
  await page.getByRole('button',{name:'Limpar tudo',exact:true}).click();
  assert.equal(await page.locator('.notification-row').count(),0,'limpar tudo esvazia o histórico, inclusive avisos já lidos');
  await page.evaluate(()=>notificationCenter.update());
  assert.equal(await page.locator('.notification-row').count(),0,'atualização não restaura avisos limpos');
  assert.equal(await page.locator('#user-invitations-button .event-notification-badge').count(),0);
  await page.evaluate(()=>{testFeed.push({...testFeed[0],id:'after-clear'});notificationCenter.update();});
  assert.equal(await page.locator('.notification-row').count(),1,'avisos posteriores continuam chegando');
  await page.evaluate(()=>{
    window.originalStorage=storage;
    window.storage={...storage,set:(key,value)=>key==='sc_notification_center_dismissed_v1'?false:originalStorage.set(key,value)};
  });
  await page.getByRole('button',{name:'Limpar tudo',exact:true}).click();
  assert.equal(await page.locator('.notification-row').count(),1,'falha de gravação não finge que a limpeza funcionou');
  await page.evaluate(()=>{
    window.storage=originalStorage;
    window.originalPlaylistApi=playlistCollaboration;
    window.testInvitations=[{id:'pending-clear-test',playlistName:'Compartilhada',inviter:{name:'Outro'}}];
    window.playlistCollaboration={...playlistCollaboration,getInbox:()=>({notifications:[],invitations:testInvitations})};
    notificationCenter.update();
  });
  assert.equal(await page.locator('#playlist-invitations-list .user-invite-panel').count(),1);
  await page.getByRole('button',{name:'Limpar tudo',exact:true}).click();
  await page.evaluate(()=>notificationCenter.update());
  assert.equal(await page.locator('#playlist-invitations-list .user-invite-panel').count(),0,'limpeza oculta também o cartão de convite');
  assert.equal(await page.evaluate(()=>testInvitations.length),1,'limpeza não aceita nem rejeita o convite');
  const isolated=await page.evaluate(()=>{
    const original=getRoudyNotificationScopes;window.getRoudyNotificationScopes=()=>['another-account'];
    const hidden=notificationCenter.isDismissed('notice-0');window.getRoudyNotificationScopes=original;
    window.playlistCollaboration=originalPlaylistApi;return hidden;
  });
  assert.equal(isolated,false,'limpeza de uma conta não oculta notificações de outra');
  await page.reload({waitUntil:'domcontentloaded'});
  const retained=await page.evaluate(()=>{
    const scopes=getRoudyNotificationScopes();
    return {read:scopes.some(s=>(storage.get('sc_notification_center_read_v1',{})[s]||[]).includes('notice-0')),cleared:notificationCenter.isDismissed('notice-0'),last:notificationCenter.isDismissed('notice-new')};
  });
  assert.deepEqual(retained,{read:true,cleared:true,last:true},'leitura e limpeza sobrevivem ao recarregamento');
  assert.deepEqual(errors,[]);
  console.log('notification-history-regression-ui.test.js: OK (1300 avisos, leitura, limpeza, mensagem nova e recarga)');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}})().catch(error=>{console.error(error);process.exitCode=1});
