const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{const p=new URL(req.url,'http://localhost').pathname,file=path.resolve(root,p==='/'?'index.html':decodeURIComponent(p.slice(1)));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return res.writeHead(404).end();res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png'}[path.extname(file)]||'application/octet-stream')+'; charset=utf-8'});fs.createReadStream(file).pipe(res);});
(async()=>{let browser;try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({contentType:'text/css',body:''}));
  await page.route('**/api/**',route=>route.fulfill({status:200,json:route.request().url().includes('/auth/config')?{enabled:false}:{}}));
  await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:'domcontentloaded'});
  const result=await page.evaluate(()=>{
    const original=appCurrentUser,now=new Date().toISOString();
    appCurrentUser=Object.freeze({...original,id:'user-a',name:'Usuário A'});
    const event=eventModel.create({id:'notice-test',title:'Ensaio',leaderId:'user-a',members:[{id:'user-a',name:'Usuário A'},{id:'user-b',name:'Usuário B'}],notifications:[
      {id:'own',actorId:'user-a',actorName:'Usuário A',summary:'alterou o evento',createdAt:now},
      {id:'other',actorId:'user-b',actorName:'Usuário B',summary:'alterou o repertório',createdAt:now},
      {id:'legacy',actorId:'',actorName:'ROUDY',summary:'atualizou o evento',createdAt:now}
    ]});
    setlists=[event];storage.set(EVENT_NOTICE_READ_KEY,{});storage.set('sc_event_messages_v1',{'notice-test':[
      {id:'chat-own',type:'text',sender:{id:'user-a',name:'Usuário A'},content:'Minha mensagem',createdAt:now},
      {id:'chat-other',type:'text',sender:{id:'user-b',name:'Usuário B'},content:'Mensagem recebida',createdAt:now}
    ]});
    const forA={unread:eventUnreadNotices(event).map(item=>item.id),feed:getRoudyNotificationItems().filter(item=>item.kind==='event').map(item=>item.id),history:event.notifications.map(item=>item.id)};
    const chatForA=getRoudyNotificationItems().filter(item=>item.kind==='message').map(item=>item.id);
    const restored=eventModel.create(JSON.parse(JSON.stringify(event)));
    const afterReload=eventUnreadNotices(restored).map(item=>item.id);
    const offline=eventModel.withSharedChange(restored,{id:'user-a',name:'Usuário A'},'event.updated','alterou o evento offline');
    const afterOffline=eventUnreadNotices(offline).map(item=>item.id);
    appCurrentUser=Object.freeze({...appCurrentUser,id:'user-b',name:'Usuário B'});
    const forB={unread:eventUnreadNotices(event).map(item=>item.id),feed:getRoudyNotificationItems().filter(item=>item.kind==='event').map(item=>item.id)};
    appCurrentUser=Object.freeze({...appCurrentUser,id:'user-a',name:'Usuário A'});markEventNoticesRead(event);
    const afterRead=eventUnreadNotices(event).map(item=>item.id);
    appCurrentUser=original;
    return {forA,forB,chatForA,afterReload,afterOffline,afterRead,unknownForA:eventNoticeTargetsUser({actorId:''},'user-a'),ownForA:eventNoticeTargetsUser({actorId:'user-a'},'user-a')};
  });
  assert.deepEqual(result.forA.unread,['other','legacy'],'A não recebe a própria atividade; autor ausente permanece seguro e visível');
  assert.deepEqual(result.forA.feed,['event:notice-test:other','event:notice-test:legacy'],'a central exclui apenas a atividade própria');
  assert.deepEqual(result.forB.unread,['own','legacy'],'B recebe a alteração de A, mas não a própria');
  assert.deepEqual(result.forB.feed,['event:notice-test:own','event:notice-test:legacy']);
  assert.deepEqual(result.chatForA,['message:notice-test:chat-other'],'mensagens próprias continuam fora e mensagens alheias continuam presentes');
  assert.deepEqual(result.afterReload,['other','legacy'],'recuperar dados não transforma atividade própria em não lida');
  assert.deepEqual(result.afterOffline,['other','legacy'],'atividade própria criada offline permanece fora das novidades');
  assert.deepEqual(result.forA.history,['own','other','legacy'],'o histórico não é alterado');
  assert.deepEqual(result.afterRead,[],'marcação como lida continua funcionando');
  assert.equal(result.unknownForA,true);assert.equal(result.ownForA,false);assert.deepEqual(errors,[]);
  console.log('event-notification-self-filter-ui.test.js: OK');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}})().catch(error=>{console.error(error);process.exitCode=1;});
