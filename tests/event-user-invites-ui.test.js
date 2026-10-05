const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{const p=new URL(req.url,'http://localhost').pathname,file=path.resolve(root,p==='/'?'index.html':decodeURIComponent(p.slice(1)));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return res.writeHead(404).end();res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png'}[path.extname(file)]||'application/octet-stream')+'; charset=utf-8'});fs.createReadStream(file).pipe(res);});
const event={id:'event-test',title:'Ensaio de domingo',date:'2026-10-11',leaderId:'sender-user',creatorId:'sender-user',remoteVersion:1,members:[{id:'sender-user',name:'Líder',role:'Liderança'}],repertoire:[]};
(async()=>{let browser;try{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  let pending=[],searchCalls=0,postBodies=[],chatRequests=0;const handles={};
  const chatMessage={id:'poll-center',type:'poll',sender:{id:'other-user',name:'Ana'},createdAt:new Date().toISOString(),poll:{question:'Teste',options:[],votes:{}}};
  async function pageFor(id,viewport){
    const context=await browser.newContext({viewport,serviceWorkers:'block'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await context.addInitScript(id=>{
      localStorage.setItem('sc_personal_song_caches_v1',JSON.stringify({[id]:[]}));localStorage.setItem('sc_personal_event_caches_v1',JSON.stringify({[id]:[]}));localStorage.setItem('sc_legacy_library_owner_v1',id);localStorage.setItem('sc_legacy_events_owner_v1',id);localStorage.setItem('sc_songs_v1','[]');localStorage.setItem('sc_events_v1','[]');
      const session={access_token:'signed-'+id,user:{id,email:id+'@example.test',user_metadata:{full_name:id}}};
      window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signOut:async()=>({})},channel:()=>({on(){return this;},subscribe(){return this;},unsubscribe(){}}),removeChannel:async()=>{}})};
    },id);
    await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));
    await page.route('https://cdn.jsdelivr.net/npm/@supabase/**',r=>r.fulfill({contentType:'application/javascript',body:''}));
    await page.route('**/api/**',async r=>{
      const url=new URL(r.request().url()),method=r.request().method();let body={},status=200;
      if(url.pathname.endsWith('/auth/config'))body={enabled:true,supabaseUrl:'https://invite-test.supabase.co',supabaseAnonKey:'public-test'};
      else if(url.pathname.endsWith('/collaboration/me'))body={id,name:id};
      else if(url.pathname.endsWith('/me/username')){if(method==='POST'){handles[id]=r.request().postDataJSON().username;status=201;}body={username:handles[id]||null};}
      else if(url.pathname.endsWith('/usernames/availability'))body={username:url.searchParams.get('username'),available:url.searchParams.get('username')!=='taken_name'};
      else if(url.pathname.endsWith('/bands'))body={bands:[]};
      else if(url.pathname.endsWith('/library/songs'))body={songs:[]};
      else if(url.pathname.endsWith('/collaboration/events'))body={events:id==='sender-user'?[event]:[]};
      else if(url.pathname.endsWith('/messages')){chatRequests++;body={messages:[chatMessage]};}
      else if(url.pathname.includes('/directory/users')){
        searchCalls++;const q=url.searchParams.get('q'),offset=Number(url.searchParams.get('offset'));
        if(q==='An'){await new Promise(resolve=>setTimeout(resolve,500));body={users:[{id:'stale-user',name:'Resultado antigo'}],nextOffset:null};}
        else body={users:offset?[{id:'third-user',name:'Ana Maria'}]:[{id:'recipient-user',name:'Ana <img src=x onerror="window.xss=true">'},{id:'other-user',name:'Ana'}],nextOffset:offset?null:20};
      }else if(url.pathname.endsWith('/direct-invitations')&&method==='POST'){
        postBodies.push(r.request().postDataJSON());pending=[{id:'direct-test',eventId:event.id,eventTitle:event.title,eventDate:event.date,role:postBodies.at(-1).role,inviter:{name:'Líder'}}];body=pending[0];status=201;
      }else if(url.pathname.endsWith('/direct-invitations'))body={invitations:id==='recipient-user'?pending:[]};
      else if(url.pathname.endsWith('/direct-invitations/direct-test/respond')){
        assert.equal(r.request().headers().authorization,'Bearer signed-recipient-user');
        const action=r.request().postDataJSON().action;pending=[];body=action==='accept'?{event:{...event,remoteVersion:2,members:[...event.members,{id:'recipient-user',name:'Ana',role:'Vocal'}]}}:{status:'rejected'};
      }else if(url.pathname.endsWith('/events/event-test'))body=event;
      return r.fulfill({status,json:body});
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>currentAuthState.authenticated&&!authLinking);
    return {page,errors,context};
  }
  const sender=await pageFor('sender-user',{width:1366,height:900}),page=sender.page;
  await page.evaluate(async()=>{await openAccountModal();openProfileSettings();});
  await page.waitForFunction(()=>!document.getElementById('profile-username').disabled);
  assert.equal(await page.getByLabel('Selecione um nome de usuário único',{exact:true}).count(),1);
  assert.equal(await page.evaluate(()=>Boolean(document.getElementById('profile-name').compareDocumentPosition(document.getElementById('profile-username'))&Node.DOCUMENT_POSITION_FOLLOWING)),true,'nome pessoal vem antes do nome de usuário');
  await page.locator('#profile-username').fill('taken_name');
  await page.waitForFunction(()=>document.querySelector('.profile-username').dataset.status==='unavailable');
  assert.equal(await page.locator('.username-indicator').evaluate(e=>getComputedStyle(e).color),'rgb(239, 68, 68)');
  assert.equal(await page.locator('#username-confirm').isDisabled(),true);
  await page.locator('#profile-username').fill('sender_music');
  await page.waitForFunction(()=>document.querySelector('.profile-username').dataset.status==='available');
  assert.equal(await page.locator('.username-indicator').evaluate(e=>getComputedStyle(e).color),'rgb(34, 197, 94)');
  page.once('dialog',dialog=>dialog.dismiss());await page.locator('#username-confirm').click();assert.equal(handles['sender-user'],undefined,'cancelar não reserva nome');
  page.once('dialog',dialog=>dialog.accept());await page.locator('#username-confirm').click();
  await page.waitForFunction(()=>document.getElementById('profile-username').readOnly);
  await page.evaluate(()=>openProfileSettings());await page.waitForFunction(()=>document.getElementById('profile-username').readOnly);
  assert.equal(await page.locator('#profile-username').inputValue(),'sender_music','nome fixo após reabrir');
  await page.evaluate(()=>closeModal());
  await page.evaluate(()=>editSetlistById('event-test'));
  await page.getByRole('button',{name:'Convidar Integrante',exact:true}).click();
  await page.locator('#event-user-search').fill('A');await page.waitForTimeout(400);assert.equal(searchCalls,0,'mínimo dois caracteres');
  await page.locator('#event-user-search').fill('An');await page.waitForTimeout(350);await page.locator('#event-user-search').fill('Ana');
  await page.waitForFunction(()=>document.getElementById('event-user-results').textContent.includes('Ana'));
  await page.waitForTimeout(650);assert.equal(await page.getByText('Resultado antigo',{exact:true}).count(),0,'resposta antiga não substitui busca');
  assert.equal(await page.locator('#event-user-results img').count(),0,'nome é texto, não HTML');
  await page.locator('#event-user-more').click();await page.waitForFunction(()=>document.getElementById('event-user-results').textContent.includes('Ana Maria'));
  await page.locator('[data-user-index="0"]').click();assert.equal(await page.locator('#event-user-profile').isVisible(),true);
  await page.locator('#event-member-role').selectOption('Vocal');await page.getByRole('button',{name:'Convidar como Integrante',exact:true}).click();
  await page.waitForFunction(()=>document.getElementById('event-user-send-status').textContent.includes('Convite enviado'));
  assert.deepEqual(postBodies,[{userId:'recipient-user',role:'Vocal'}]);assert.equal(await page.locator('#event-invite-link').isVisible(),true,'convite por link preservado');
  await page.evaluate(()=>{
    closeModal();const e=findEvent('event-test');e.notifications.push({id:'change-center',actorName:'Outro integrante',summary:'alterou o repertório <img src=x onerror="window.xss=true">',createdAt:new Date().toISOString()});
    storage.set('sc_event_messages_v1',{'event-test':[{id:'poll-center',type:'poll',sender:{id:'other-user',name:'Ana'},createdAt:new Date().toISOString(),poll:{question:'Teste'}}]});
    musicas.push({id:'center-song',title:'Música aberta',key:'C',blocos:[{c:'C G',l:'Teste'}]});openDetail('center-song');notificationCenter.open();
  });
  assert.equal(await page.locator('.notification-unread').count(),2,'alteração e enquete na central');
  assert.equal(await page.locator('#roudy-notification-items img').count(),0,'notificação escapa conteúdo');
  await page.getByRole('button',{name:'Marcar todas como lidas',exact:true}).click();
  assert.equal(await page.locator('.notification-unread').count(),0);
  await page.getByRole('button',{name:'Ver evento',exact:true}).click();
  assert.equal(await page.locator('#view-detail').isVisible(),false,'abre evento diretamente, sem camada de música');
  assert.equal(await page.locator('#view-sd').isVisible(),true);
  await page.evaluate(()=>notificationCenter.open());await page.getByRole('button',{name:'Abrir conversa',exact:true}).click();
  await page.waitForFunction(()=>!document.getElementById('event-chat-view').hidden);
  assert.equal(await page.locator('#event-chat-view').isVisible(),true,'notificação abre conversa');
  await page.waitForTimeout(400);assert.ok(chatRequests<12,'atualização do chat não causa consultas recursivas');
  const recipient=await pageFor('recipient-user',{width:390,height:844});
  await recipient.page.waitForFunction(()=>document.getElementById('user-invitations-button').textContent.includes('1'));
  await recipient.page.locator('#user-invitations-button').click();
  assert.equal(await recipient.page.getByText('Notificações',{exact:true}).count(),1);
  await recipient.page.getByRole('button',{name:'Marcar todas como lidas',exact:true}).click();
  assert.equal(pending.length,1,'ler convite não responde');
  assert.equal(await recipient.page.getByRole('button',{name:'Aceitar',exact:true}).count(),1);
  await recipient.page.getByRole('button',{name:'Rejeitar',exact:true}).click();
  await recipient.page.waitForFunction(()=>document.getElementById('user-invitations-status').textContent.includes('não tem'));
  assert.equal(await recipient.page.evaluate(()=>setlists.some(e=>e.id==='event-test')),false,'rejeitar não adiciona evento');
  pending=[{id:'direct-test',eventId:event.id,eventTitle:event.title,eventDate:event.date,role:'Vocal',inviter:{name:'Líder'}}];
  await recipient.page.evaluate(()=>eventUserInvites.refresh(true));await recipient.page.getByRole('button',{name:'Aceitar',exact:true}).click();
  await recipient.page.waitForFunction(()=>setlists.some(e=>e.id==='event-test'));
  assert.equal(await recipient.page.evaluate(()=>eventModel.canEditShared(setlists.find(e=>e.id==='event-test'),appCurrentUser.id)),false);
  await recipient.page.evaluate(()=>appAuth.signOut());
  assert.equal(await recipient.page.locator('#user-invitations-button').isVisible(),true,'sino permanece para notificações locais');
  assert.equal(await recipient.page.evaluate(()=>eventUserInvites.getPending().length),0,'logout limpa convites da conta');
  assert.equal(await recipient.page.evaluate(()=>getRoudyNotificationItems().some(i=>i.eventId==='event-test')),false,'convidado não vê notificações dos eventos da conta anterior');
  assert.deepEqual(sender.errors,[]);assert.deepEqual(recipient.errors,[]);assert.equal(await page.evaluate(()=>window.xss||false),false);
  console.log('event-user-invites-ui.test.js: OK (busca, debounce, respostas atrasadas, paginação, perfil seguro, envio, sino, rejeição e aceite em desktop/celular)');
}finally{await browser?.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1;});
