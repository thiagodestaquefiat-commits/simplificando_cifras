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
  const cdp=await context.newCDPSession(page);
  for(const width of [375,390,820]){
    await page.setViewportSize({width,height:667});
    await page.evaluate(()=>{
      appCurrentUser={id:'scroll-owner',name:'Conta de teste',role:'Liderança'};
      setlists=Array.from({length:40},(_,i)=>eventModel.create({id:'scroll-'+i,title:'Evento '+i,date:'2099-11-24',leaderId:'scroll-owner',members:[{id:'scroll-owner',name:'Conta de teste'}],repertoire:[]}));
      switchTab('setlists');renderSetlists();window.scrollTo(0,420);
    });
    await page.waitForTimeout(80);
    const previous=await page.evaluate(()=>({y:scrollY,top:document.getElementById('pane-setlists').getBoundingClientRect().top}));
    assert.ok(previous.y>0,'lista de eventos possui rolagem real antes de abrir o detalhe');
    await page.evaluate(()=>openSD('scroll-0',{refreshChat:false}));
    await page.waitForFunction(()=>document.body.style.position==='fixed');
    const origin=await page.evaluate(()=>document.getElementById('pane-setlists').getBoundingClientRect().top);
    assert.ok(Math.abs(origin-previous.top)<1,'abrir detalhe não desloca a página atrás');
    for(const distance of [550,-550]){
      await cdp.send('Input.synthesizeScrollGesture',{x:Math.min(width-30,180),y:420,yDistance:distance,gestureSourceType:'touch',speed:700});
      await page.mouse.move(160,420);await page.mouse.wheel(0,distance);await page.waitForTimeout(80);
      assert.ok(Math.abs(await page.evaluate(()=>document.getElementById('pane-setlists').getBoundingClientRect().top)-origin)<1,'gesto não move lista de eventos por trás');
    }
    assert.equal(await page.locator('#view-sd').evaluate(node=>getComputedStyle(node).overscrollBehaviorY),'none');
    await page.evaluate(()=>openSD('scroll-0',{preserveScroll:true,refreshChat:false}));
    await page.evaluate(()=>closeSD());
    await page.waitForFunction(()=>document.body.style.position!=='fixed');
    assert.ok(Math.abs(await page.evaluate(()=>scrollY)-previous.y)<1,'voltar restaura a posição da lista');
  }
  await page.evaluate(()=>{
    musicas=Array.from({length:30},(_,i)=>({id:'long-song-'+i,title:'Música '+i,key:'G',blocks:[]}));
    setlists[0]=eventModel.create({...setlists[0],repertoire:musicas.map((song,i)=>({id:'item-'+i,songId:song.id,songData:song,shared:{key:'G'}}))});openSD('scroll-0',{refreshChat:false});
  });
  await page.waitForFunction(()=>document.body.style.position==='fixed');
  await page.mouse.move(180,420);await page.mouse.wheel(0,900);await page.waitForTimeout(200);
  assert.ok(await page.locator('#view-sd').evaluate(node=>node.scrollTop)>0,'repertório longo continua rolando por dentro');
  await page.evaluate(()=>document.getElementById('view-sd').style.display='none');
  await page.waitForFunction(()=>document.body.style.position!=='fixed');
  assert.deepEqual(errors,[]);
  console.log('event-scroll-lock-ui.test.js: OK');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve))}})().catch(error=>{console.error(error);process.exitCode=1});
