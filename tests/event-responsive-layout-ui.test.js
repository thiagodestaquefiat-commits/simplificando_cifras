const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),shots=path.join(require('node:os').tmpdir(),'roudy-event-spacing');
const types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{const pathname=new URL(req.url,'http://localhost').pathname,file=path.resolve(root,pathname==='/'?'index.html':decodeURIComponent(pathname.slice(1)));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return res.writeHead(404).end();res.writeHead(200,{'Content-Type':(types[path.extname(file)]||'application/octet-stream')+'; charset=utf-8'});fs.createReadStream(file).pipe(res)});
(async()=>{let browser;try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  fs.mkdirSync(shots,{recursive:true});
  browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,serviceWorkers:'block'}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({contentType:'text/css',body:''}));
  await page.route('**/api/**',route=>route.fulfill({status:200,contentType:'application/json',body:'{}'}));
  await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:'domcontentloaded'});
  await page.getByRole('button',{name:'Continuar sem login'}).click();
  await page.evaluate(()=>{
    appCurrentUser={id:'responsive-user',name:'Teste'};
    setlists=[eventModel.create({id:'responsive-event',title:'Culto de jovens e apresentação especial com nome comprido',date:'2099-11-24',time:'19:30',location:'Auditório principal com endereço comprido',leaderId:'responsive-user',members:[{id:'responsive-user',name:'Teste'}],repertoire:[]})];
    switchTab('setlists');
  });
  for(const width of [280,320,344,360,375,390,412,430,600,768,1024]){
    await page.setViewportSize({width,height:844});
    for(const zoom of [1,1.25,1.5]){
      await page.evaluate(zoom=>document.documentElement.style.zoom=String(zoom),zoom);
      const metrics=await page.locator('#pane-setlists .setlist-item').first().evaluate(row=>{
        const r=row.getBoundingClientRect(),text=row.querySelector('.sl-info').getBoundingClientRect(),arrow=row.querySelector('.event-disclosure').getBoundingClientRect();
        return {row:r.width,text:text.width,top:text.top,arrowTop:arrow.top,right:r.right,viewport:innerWidth,scroll:document.documentElement.scrollWidth};
      });
      assert.ok(metrics.text>=metrics.row*.4,JSON.stringify({width,zoom,metrics}));
      assert.ok(Math.abs(metrics.top-metrics.arrowTop)<20,'disclosure stays on same row');
      assert.ok(metrics.scroll<=width+1,'no page horizontal overflow at '+width+' zoom '+zoom);
    }
  }
  await page.evaluate(()=>document.documentElement.style.zoom='1');
  for(const width of [320,360,390,768]){
    await page.setViewportSize({width,height:720});
    for(const tab of ['musicas','medley','setlists']){
      await page.evaluate(tab=>switchTab(tab),tab);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'page overflow: '+tab+' at '+width);
    }
    await page.evaluate(()=>openPrimarySearchTab());await page.waitForTimeout(80);
    assert.ok(await page.locator('#roudy-search').evaluate(n=>n.scrollWidth<=n.clientWidth+1),'search overflow at '+width);
    await page.evaluate(()=>{roudySearchMenu.close({immediate:true});switchTab('setlists');openSD('responsive-event',{refreshChat:false});});
    assert.ok(await page.locator('#view-sd').evaluate(n=>n.scrollWidth<=n.clientWidth+1),'event detail overflow at '+width);
    await page.evaluate(()=>closeSD());
  }
  assert.deepEqual(errors,[]);console.log('event-responsive-layout-ui: OK (11 widths x 3 zoom levels)');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve))}})().catch(error=>{console.error(error);process.exitCode=1});
