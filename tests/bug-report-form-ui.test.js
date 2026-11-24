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

  await page.evaluate(()=>{
    window.appAuth={...appAuth,getState:()=>({authenticated:true,user:{id:'support-test'}}),getAccessToken:()=> 'fake-token'};
    openAccountDrawerHelpSupport();
  });
  await page.getByRole('button',{name:/Relatar bugs/}).click();
  for(const size of [{width:390,height:844},{width:320,height:568},{width:844,height:390},{width:1280,height:800}]){
    await page.setViewportSize(size);
    const bounds=await page.locator('.account-drawer').boundingBox();
    assert.equal(bounds.x,0);assert.equal(bounds.y,0);
    assert.equal(bounds.width,size.width,'relato ocupa toda a largura, sem a faixa da gaveta');
    assert.equal(bounds.height,size.height);
    assert.equal(await page.locator('.account-drawer').evaluate(el=>el.scrollWidth<=el.clientWidth),true,'sem rolagem horizontal');
    await page.getByRole('button',{name:'Enviar relato',exact:true}).scrollIntoViewIfNeeded();
    assert.equal(await page.getByRole('button',{name:'Enviar relato',exact:true}).isVisible(),true);
  }
  await page.setViewportSize({width:390,height:844});
  await page.locator('.account-drawer').evaluate(el=>el.scrollTop=0);
  if(process.env.SUPPORT_SCREENSHOT)await page.screenshot({path:process.env.SUPPORT_SCREENSHOT});
  await page.locator('.bug-report-screen .account-drawer-subheader button').click();
  assert.ok((await page.locator('.account-drawer').boundingBox()).width<390,'voltar restaura a largura da gaveta');
  await page.getByRole('button',{name:/Relatar bugs/}).click();
  await page.locator('#bug-description').fill('A notificação aparece depois de ler todas.');
  assert.equal(await page.locator('#bug-report-form textarea').count(),1);
  assert.equal(await page.locator('#bug-description').getAttribute('aria-describedby'),'bug-description-help bug-report-privacy');
  assert.equal(await page.locator('.bug-report-guide-list li').count(),3);
  assert.match(await page.locator('#bug-description-help').textContent(),/onde tocou ou clicou/);
  let requests=0;
  await page.route('**/api/collaboration/bug-reports',async route=>{
    requests++;
    const body=route.request().postDataJSON();
    assert.ok(body.clientId);assert.match(body.description,/notificação/);
    assert.equal(body.steps,undefined);
    if(requests===1)return route.fulfill({status:503,json:{erro:{mensagem:'offline'}}});
    return route.fulfill({status:201,json:{id:body.clientId,emailStatus:'accepted'}});
  });
  await page.getByRole('button',{name:'Enviar relato',exact:true}).click();
  await page.locator('#bug-report-status').filter({hasText:'O texto continua aqui'}).waitFor();
  assert.match(await page.locator('#bug-description').inputValue(),/notificação/);
  await page.getByRole('button',{name:'Enviar relato',exact:true}).click();
  await page.locator('#bug-report-status').filter({hasText:'Protocolo:'}).waitFor();
  assert.equal(requests,2);
  assert.equal(await page.locator('#bug-description').isDisabled(),true);
  assert.deepEqual(errors,[]);
  console.log('bug-report-form-ui.test.js: OK');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}})().catch(error=>{console.error(error);process.exitCode=1;});
