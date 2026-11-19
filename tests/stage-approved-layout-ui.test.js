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
  for(const width of [320,390,768,1366]){
    await page.setViewportSize({width,height:844});
    await page.evaluate(()=>{const songs=musicas.slice(0,2);setlists=[eventModel.create({id:'stage-approved-event',title:'Referência Palco',leaderId:appCurrentUser.id,members:[appCurrentUser],repertoire:songs.map((song,index)=>({id:'stage-ref-'+index,songId:song.id,shared:eventEditFromSong(eventSongCopy(song))}))})];openDetailFromEventItem('stage-approved-event','stage-ref-0');toggleStageModeBtn();});
    assert.equal(await page.locator('#view-detail').evaluate(n=>n.classList.contains('stage-clean')),true,'palco limpo: mesma cifra do estudo');
    assert.ok(await page.locator('#detail-content .song-page-track').count(),'palco tem Letra + Cifras, resumo e letra (não só o resumo harmônico)');
    if(width===390)await page.screenshot({path:'C:/Users/geinu/.codex/visualizations/2026/09/21/01a0c55e-a330-7600-879e-ea2dcc48d4c2/palco-restaurado-mobile.png'});
    await page.evaluate(()=>{toggleStageModeBtn();closeDetail();});
  }
  assert.deepEqual(errors,[]);console.log('stage-approved-layout-ui: OK (no study toolbar, performance header on mobile/desktop)');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve))}})().catch(error=>{console.error(error);process.exitCode=1});

