const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{chromium}=require(process.env.ROUDY_TEST_PLAYWRIGHT||'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.ROUDY_CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{
  for(const width of [390,1366]){
   const page=await browser.newPage({viewport:{width,height:900},serviceWorkers:'block'}),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/api/**',r=>r.fulfill({json:{enabled:false,songs:[],events:[],bands:[]}}));
   await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));
   await page.goto('http://127.0.0.1:4173/?convite-funcao-teste=1');await page.waitForFunction(()=>loginGateAuthReady);
   await page.evaluate(()=>{
    continueWithoutLogin();currentAuthState={authenticated:true,user:{id:appCurrentUser.id}};
    window.appAuth={...appAuth,getState:()=>currentAuthState,getAccessToken:()=> 'fixture-token'};
    setlists.push(eventModel.create({id:'role-event',title:'Evento de teste',remoteVersion:1,date:'2030-10-20',leaderId:appCurrentUser.id,members:[{...appCurrentUser,isLeader:true}],repertoire:[]}));
    window.__direct=[];window.__links=[];window.__shares=[];window.__copied=[];window.__confirmMessages=[];window.__searches=[];
    window.eventCollaboration={...eventCollaboration,searchUsers:async(...args)=>{window.__searches.push(args);return args[1]?{users:[{id:'role-recipient-more',name:'Ana B',username:'ana_b'}],nextOffset:null}:{users:[{id:'role-recipient',name:'Ana',username:'ana'}],nextOffset:20};},inviteUser:async(...args)=>{window.__direct.push(args);return {id:'invitation'};},createInvitation:async(...args)=>{window.__links.push(args);return {token:'a'.repeat(43),eventTitle:'Evento de teste'};}};
    window.appConfirm=text=>{window.__confirmMessages.push(text);return true;};
    Object.defineProperty(navigator,'share',{configurable:true,value:async value=>{window.__shares.push(value);}});
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>{window.__copied.push(value);}}});
    openEventInviteSheet('role-event');
   });
   const select=page.getByRole('combobox',{name:'Convidar como',exact:true});
   assert.equal(await select.inputValue(),'Vocal');
   const roles=await select.locator('option').evaluateAll(nodes=>nodes.map(n=>n.value));
   assert.deepEqual(roles,['Vocal','Backing Vocal','Guitarra','Violão','Baixo','Bateria','Teclado','Ukulele','Violino']);
   for(const role of ['Liderança','Outra','Percussão','Outros','Áudio','Viola Caipira','Cavaco'])assert.ok(!roles.includes(role),role+' não aparece no seletor');
   assert.equal(await page.evaluate(()=>getEventInviteRole('role-event')),'Vocal','valor enviado acompanha a opção inicial visível');
   await select.selectOption('Guitarra');assert.match(await select.locator('option:checked').innerText(),/Convidar como guitarrista/);
   const screenshotDir=process.env.SCREENSHOT_DIR||path.join(os.tmpdir(),'roudy-tests');fs.mkdirSync(screenshotDir,{recursive:true});
   await page.locator('.event-action-sheet').screenshot({path:path.join(screenshotDir,`roudy-invite-role-${width}.png`)});
   assert.ok(await page.locator('.event-invite-role').evaluate(n=>n.scrollWidth<=n.clientWidth),'seletor cabe na tela');
   await page.getByRole('button',{name:'Buscar',exact:true}).click();
   await page.locator('#event-people-search-input').fill('Ana');
   await page.getByRole('button',{name:'Mostrar mais',exact:true}).click();
   await page.waitForFunction(()=>window.__searches.length===2);
   assert.deepEqual(await page.evaluate(()=>window.__searches[1]),['Ana',20,'Guitarra'],'paginação mantém a prioridade selecionada');
   await page.locator('[data-sheet-user="0"]').click();
   await page.waitForFunction(()=>window.__direct.length===1);
   assert.deepEqual(await page.evaluate(()=>window.__searches[0]),['Ana',0,'Guitarra']);
   assert.deepEqual(await page.evaluate(()=>window.__direct[0]),['role-event','role-recipient','Guitarra']);
   assert.match(await page.evaluate(()=>window.__confirmMessages.at(-1)),/guitarrista/);
   await page.evaluate(()=>{eventUserInvites.closeSearchSheet();openEventInviteSheet('role-event');});
   assert.equal(await select.inputValue(),'Guitarra','função permanece ao retornar à tela');
   for(const role of roles){
    await select.selectOption(role);await page.getByRole('button',{name:'Compartilhar',exact:true}).click();
    await page.waitForFunction(()=>!document.getElementById('event-action-layer').classList.contains('is-open'));
    assert.equal(await page.evaluate(()=>window.__links.at(-1)[2]),role);
    assert.match(await page.evaluate(()=>window.__shares.at(-1).url),/#convite=[A-Za-z0-9_-]+$/);
    assert.equal(await page.evaluate(()=>window.__shares.at(-1).url.includes('share=')),false,'envia convite, não cópia do evento');
    await page.evaluate(()=>openEventInviteSheet('role-event'));
   }
   await select.selectOption('Baixo');
   await page.evaluate(()=>Object.defineProperty(navigator,'share',{configurable:true,value:async()=>{throw new Error('indisponível');}}));
   await page.getByRole('button',{name:'Mais',exact:true}).click();await page.waitForFunction(()=>window.__copied.length===1);
   assert.match(await page.evaluate(()=>window.__copied[0]),/baixista/);
   const before=await page.evaluate(()=>window.__links.length);
   await page.evaluate(()=>{currentAuthState={authenticated:true,user:{id:'other-account'}};});
   await page.getByRole('button',{name:'Compartilhar',exact:true}).click();assert.equal(await page.evaluate(()=>window.__links.length),before,'não compartilha convite de outra conta');
   assert.deepEqual(errors,[]);await page.close();
  }
  console.log('event-invite-role-ui: OK (seletor, instrumentos, busca, links, retorno, fallback e conta em celular/desktop)');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
