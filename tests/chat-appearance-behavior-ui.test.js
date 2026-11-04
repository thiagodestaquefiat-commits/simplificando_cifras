const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{
  const file=path.resolve(root,new URL(req.url,'http://localhost').pathname.slice(1)||'index.html');
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return res.writeHead(404).end();
  res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.json':'application/json'}[path.extname(file)]||'application/octet-stream')});fs.createReadStream(file).pipe(res);
});
(async()=>{let browser;try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  const context=await browser.newContext({viewport:{width:390,height:650},serviceWorkers:'block',hasTouch:true}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));
  await page.route('**/api/**',r=>r.fulfill({status:200,json:{}}));
  await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:'domcontentloaded'});
  await page.getByRole('button',{name:'Continuar sem login'}).click();
  await page.evaluate(async()=>{
    const ev=eventModel.create({id:'appearance-fixture',title:'Ensaio de domingo',date:'2026-12-13',leaderId:appCurrentUser.id,members:[{id:appCurrentUser.id,name:'Eu'}]});setlists=[ev];currentSdId=ev.id;await openEventChat();
    selectEventChatBackground('roudy-guitar');selectEventChatBackground('roudy-teal');openEventChatBackgrounds();
  });
  for(const width of [375,390,430]){
    await page.setViewportSize({width,height:650});
    const scroller=page.locator('.chat-appearance-page');
    const sizes=await scroller.evaluate(n=>({height:n.clientHeight,content:n.scrollHeight,rect:n.getBoundingClientRect().bottom}));
    assert.ok(sizes.content>sizes.height,'fundos excedem a área visível');assert.ok(sizes.rect<=651,'área rolável fica dentro da tela');
    await scroller.hover();await page.mouse.wheel(0,950);
    await page.waitForFunction(()=>document.querySelector('.chat-appearance-page').scrollTop>100);
    await scroller.evaluate(n=>n.scrollTop=n.scrollHeight);
    assert.ok(await page.locator('.chat-background-wallpaper-grid button').last().isVisible());
    const last=await page.locator('.chat-background-wallpaper-grid button').last().boundingBox();assert.ok(last.y+last.height<=651,'última sugestão acessível no final do scroll');
    await scroller.evaluate(n=>n.scrollTop=0);
  }
  // History order changes after each selection: rendered cards must retain IDs.
  const history=page.locator('.chat-background-wallpaper-carousel');
  await history.locator('[data-theme="roudy-guitar"]').click();
  await history.locator('[data-theme="roudy-teal"]').click();
  assert.equal(await page.evaluate(()=>eventChatBackground()),'roudy-teal');
  await page.evaluate(()=>openChatAppearance());
  const presets=page.locator('.chat-style-preset');await presets.last().scrollIntoViewIfNeeded();
  const before=await page.locator('.chat-appearance-page').evaluate(n=>n.scrollTop);
  await presets.last().click();assert.equal(await page.locator('.chat-appearance-page').evaluate(n=>n.scrollTop),before,'seleção não recria a página nem muda o scroll');
  assert.equal(await page.locator('.chat-style-preset.is-selected').count(),1);
  await page.evaluate(()=>{selectEventChatBackground('roudy-guitar');selectEventChatBubbleColor(EVENT_CHAT_BUBBLE_COLORS.find(color=>color!=='#04488F'));openEventChatBubbleColors();});
  const bubbleBeforeReset=await page.evaluate(()=>eventChatBubbleColor());
  await page.getByRole('button',{name:'Mais opções dos balões'}).click();
  assert.equal(await page.getByRole('menuitem',{name:'Restabelecer estilo'}).isVisible(),true);
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(()=>eventChatBubbleColor()),bubbleBeforeReset,'fechar menu não altera a cor');
  await page.getByRole('button',{name:'Mais opções dos balões'}).click();
  await page.getByRole('menuitem',{name:'Restabelecer estilo'}).click();
  assert.equal(await page.locator('.chat-appearance-header h2').textContent(),'Balões de chat','restabelecer mantém a seleção de balões aberta');
  assert.equal(await page.evaluate(()=>eventChatBubbleColor()),'#04488F');
  assert.equal(await page.evaluate(()=>eventChatBackground()),'roudy-guitar','restabelecer balões preserva o fundo');
  assert.equal(await page.locator('.chat-bubble-color[aria-checked="true"]').getAttribute('data-color'),'#04488F');
  await page.evaluate(()=>openEventChatBackgroundColors());
  await page.getByRole('button',{name:'Mais opções do fundo'}).click();
  await page.getByRole('menuitem',{name:'Restabelecer estilo'}).click();
  assert.equal(await page.locator('.chat-appearance-header h2').textContent(),'Cor','restabelecer mantém a página de gradientes');
  assert.equal(await page.evaluate(()=>eventChatBackground()),'pattern');
  await page.evaluate(()=>{closeModal();openEventChatPhotoViewer(findEvent(currentSdId));});
  await page.getByRole('button',{name:'Editar foto',exact:true}).click();
  assert.ok(await page.locator('#event-chat-photo-actions').evaluate(n=>n.classList.contains('is-open')));
  await page.getByRole('button',{name:'Editar foto',exact:true}).click();
  assert.equal(await page.locator('#event-chat-photo-actions').evaluate(n=>n.classList.contains('is-open')),false);
  await page.getByRole('button',{name:'Editar foto',exact:true}).click();await page.keyboard.press('Escape');
  assert.equal(await page.locator('#event-chat-photo-actions').evaluate(n=>n.classList.contains('is-open')),false);
  await page.getByRole('button',{name:'Compartilhar',exact:true}).click();
  assert.equal(await page.locator('#event-chat-photo-viewer-share').isVisible(),true);
  await page.locator('.event-photo-viewer-image').click();assert.equal(await page.locator('#event-chat-photo-viewer-share').isVisible(),false);
  await page.getByRole('button',{name:'Compartilhar',exact:true}).click();
  await page.getByRole('button',{name:'Editar foto',exact:true}).click();
  assert.equal(await page.locator('#event-chat-photo-viewer-share').isVisible(),false,'editar fecha o menu de compartilhar');
  await page.getByRole('button',{name:'Compartilhar',exact:true}).click();
  await page.locator('#event-chat-photo-actions').waitFor({state:'hidden'});
  assert.equal(await page.locator('#event-chat-photo-viewer-share').isVisible(),true,'compartilhar fecha a edição');
  await page.getByRole('button',{name:'Compartilhar',exact:true}).click();
  assert.equal(await page.locator('#event-chat-photo-viewer-share').isVisible(),false,'segundo toque fecha compartilhar');
  // Outside taps still dismiss when the image consumes bubbling events.
  await page.evaluate(()=>document.querySelector('.event-photo-viewer-image').addEventListener('click',e=>e.stopImmediatePropagation()));
  await page.getByRole('button',{name:'Editar foto',exact:true}).click();
  await page.locator('.event-photo-viewer-image').click({position:{x:20,y:20}});
  await page.locator('#event-chat-photo-actions').waitFor({state:'hidden'});
  for(const width of [375,390,430]){
    await page.setViewportSize({width,height:650});
    await page.getByRole('button',{name:'Editar foto',exact:true}).click();
    const title=page.locator('#event-chat-photo-actions h2');
    await title.evaluate(async n=>{await n.getAnimations().reduce((wait,a)=>wait.then(()=>a.finished.catch(()=>{})),Promise.resolve());});
    const bounds=await title.boundingBox(),x=bounds.x+30,y=bounds.y+12;
    await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x,y+110,{steps:8});await page.mouse.up();
    await page.locator('#event-chat-photo-actions').waitFor({state:'hidden'});
  }
  await page.getByRole('button',{name:'Editar foto',exact:true}).click();
  const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Selecionar foto',exact:true}).click();await (await chooser).setFiles([]);
  assert.equal(await page.locator('#event-chat-photo-actions').evaluate(n=>n.classList.contains('is-open')),false,'cancelar seletor de arquivo não deixa o painel aberto');
  await page.evaluate(()=>closeEventChatPhotoViewer());
  if(process.env.ROUDY_TEST_ARTIFACTS){fs.mkdirSync(process.env.ROUDY_TEST_ARTIFACTS,{recursive:true});await page.evaluate(()=>openEventChatBackgrounds());await page.screenshot({path:path.join(process.env.ROUDY_TEST_ARTIFACTS,'chat-fundos-430.png')});}
  assert.deepEqual(errors,[]);console.log('chat-appearance-behavior-ui.test.js: OK (375/390/430, scroll, histórico estável, seleção, restabelecer e foto)');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}})().catch(e=>{console.error(e);process.exitCode=1});
