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
  const host='deploy-preview-127--simplificandocifras.netlify.app';
  await page.route(`https://${host}/**`,route=>{
    const pathname=new URL(route.request().url()).pathname;
    if(pathname.startsWith('/api/'))return route.fulfill({contentType:'application/json',body:'{}'});
    const file=path.resolve(root,pathname==='/'?'index.html':decodeURIComponent(pathname.slice(1)));
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:''});
    return route.fulfill({contentType:types[path.extname(file)]||'application/octet-stream',body:fs.readFileSync(file)});
  });
  for(const [width,query,hidden] of [[390,'',true],[820,'',false],[390,'?testLogin=1',false]]){
    await page.setViewportSize({width,height:844});
    await page.goto(`https://${host}/${query}`,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>loginGateAuthReady);
    assert.equal(await page.locator('#login-gate').isHidden(),hidden,JSON.stringify({width,query}));
    assert.equal(await page.evaluate(()=>appAuth.getState().authenticated),false,'atalho entra como convidado, sem fabricar sessão');
  }
  assert.deepEqual(errors,[]);
  console.log('mobile-preview-guest-ui.test.js: OK');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve))}})().catch(error=>{console.error(error);process.exitCode=1});
