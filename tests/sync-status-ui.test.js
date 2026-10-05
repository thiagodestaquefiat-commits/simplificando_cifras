const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname,file=path.resolve(root,pathname==='/'?'index.html':pathname.slice(1));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}
  const type={'.js':'application/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json'}[path.extname(file)]||'application/octet-stream';
  res.writeHead(200,{'Content-Type':type+'; charset=utf-8'});fs.createReadStream(file).pipe(res);
});
(async()=>{
  let browser;
  try{
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const executablePath=['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].find(fs.existsSync);
    browser=await chromium.launch({headless:true,executablePath});
    const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
    await context.route('**/api/auth/config',route=>route.fulfill({json:{enabled:false,provider:'local'}}));
    await context.route('https://fonts.googleapis.com/**',route=>route.fulfill({contentType:'text/css',body:''}));
    const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:'domcontentloaded'});
    await page.getByText('Continuar sem login',{exact:true}).click();
    assert.equal(await page.locator('#library-sync-hint').innerText(),'Alterações salvas neste dispositivo');
    for(const width of [390,1366]){
      await page.setViewportSize({width,height:844});
      await page.evaluate(()=>{document.getElementById('modal-overlay').style.display='flex';renderLibrarySyncPanel({phase:'synced',authenticated:true,online:true,pending:0,conflicts:0,lastConfirmedAt:null});});
      assert.equal(await page.getByText('Tudo atualizado',{exact:true}).count(),0,'sem confirmação não mostra atualizado');
      await page.evaluate(()=>renderLibrarySyncPanel({phase:'synced',authenticated:true,online:true,pending:0,conflicts:0,lastConfirmedAt:'2026-10-01'}));
      assert.equal(await page.getByText('Tudo atualizado',{exact:true}).isVisible(),true);
      if(!await page.locator('.sync-advanced').evaluate(el=>el.open))await page.locator('.sync-advanced summary').click();
      assert.equal(await page.getByText('Recuperar versões',{exact:true}).count(),0);
      await page.evaluate(()=>renderLibrarySyncPanel({phase:'offline',authenticated:true,online:false,pending:1,conflicts:0}));
      assert.equal(await page.getByText('Aguardando conexão para sincronizar',{exact:true}).isVisible(),true);
      assert.equal(await page.locator('.sync-advanced').evaluate(el=>el.open),true,'atualização mantém opções abertas');
      await page.evaluate(()=>renderLibrarySyncPanel({phase:'error',authenticated:true,online:true,pending:1,error:'<secret>private failure'}));
      assert.equal(await page.getByText('Não foi possível sincronizar agora',{exact:true}).isVisible(),true);
      assert.equal(await page.getByText('<secret>private failure',{exact:true}).count(),0);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'layout sem overflow');
    }
    await page.evaluate(()=>{uiI18n.setLanguage('en');renderLibrarySyncPanel({phase:'synced',authenticated:true,online:true,pending:0,conflicts:0,lastConfirmedAt:'2026-10-01'});});
    await page.getByText('Everything up to date',{exact:true}).waitFor();
    assert.deepEqual(errors,[]);console.log('sync-status-ui.test.js: OK (status confirmado, visitante, offline, erro, idiomas e mobile/desktop)');
  }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
