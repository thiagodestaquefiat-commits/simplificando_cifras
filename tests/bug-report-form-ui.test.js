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
