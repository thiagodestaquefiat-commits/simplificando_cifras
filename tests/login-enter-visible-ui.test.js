const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),shots=path.join(require('node:os').tmpdir(),'roudy-search-review');
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
  await page.getByRole('button',{name:'Entrar',exact:true}).waitFor();
  for(const [width,height] of [[320,568],[375,667],[390,844],[777,837],[820,600]]){
    await page.setViewportSize({width,height});
    await page.locator('#login-gate').evaluate(node=>node.scrollTop=0);
    const entry=page.getByRole('button',{name:'Entrar',exact:true});
    const bounds=await entry.boundingBox();
    assert.ok(bounds.y>=0&&bounds.y+bounds.height<=height,JSON.stringify({width,height,bounds}));
    assert.equal(await entry.evaluate(node=>{const r=node.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('button')===node}),true);
  }
  await page.setViewportSize({width:390,height:500});
  await page.getByRole('button',{name:'Continuar sem login'}).scrollIntoViewIfNeeded();
  assert.equal(await page.getByRole('button',{name:'Continuar sem login'}).isVisible(),true);
  await page.getByRole('button',{name:'Entrar',exact:true}).click();
  assert.equal(await page.locator('#login-email-form').isVisible(),true);
  assert.deepEqual(errors,[]);
  console.log('login-enter-visible-ui.test.js: OK');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve))}})().catch(error=>{console.error(error);process.exitCode=1});
