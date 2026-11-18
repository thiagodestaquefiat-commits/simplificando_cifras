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
  for(const width of [320,375,390,430,820]){
    await page.setViewportSize({width,height:667});
    for(const title of ['Jdbcbc','Evento com um nome bastante longo para conferir o corte do título no cabeçalho compacto']){
      await page.evaluate(title=>{
        appCurrentUser={id:'header-owner',name:'Conta de teste',role:'Liderança'};
        musicas=Array.from({length:30},(_,i)=>({id:'header-song-'+i,title:'Música '+i,key:'G',blocks:[]}));
        setlists=[eventModel.create({id:'header-event',title,date:'2099-11-24',leaderId:'header-owner',members:[{id:'header-owner',name:'Conta de teste'}],repertoire:musicas.map((song,i)=>({id:'header-item-'+i,songId:song.id,songData:song,shared:{key:'G'}}))})];
        openSD('header-event',{refreshChat:false});document.getElementById('view-sd').scrollTop=420;
      },title);
      await page.waitForFunction(()=>document.getElementById('view-sd').classList.contains('is-event-header-compact'));
      const geometry=await page.locator('#sd-title-condensed').evaluate(node=>{
        const r=node.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(node);const text=range.getBoundingClientRect(),back=document.querySelector('#view-sd .event-detail-back').getBoundingClientRect(),chat=document.querySelector('#view-sd #event-chat-fab').getBoundingClientRect();
        return {lineHeight:getComputedStyle(node).lineHeight,center:Math.abs(text.y+text.height/2-(chat.y+chat.height/2)),backOverlap:r.left<back.right-1,chatOverlap:r.right>chat.left+1,ellipsis:getComputedStyle(node).textOverflow,opacity:parseFloat(getComputedStyle(node).opacity),truncated:node.classList.contains('is-truncated')};
      });
      assert.equal(geometry.lineHeight,'60px');
      assert.ok(geometry.center<5,JSON.stringify({width,title,geometry}));
      assert.equal(geometry.backOverlap,false);assert.equal(geometry.chatOverlap,false);
      assert.equal(geometry.ellipsis,'ellipsis');assert.equal(geometry.opacity,1);
      if(title.length>30)assert.equal(geometry.truncated,true);
      if(width===390&&title==='Jdbcbc')await page.screenshot({path:path.join(shots,'event-compact-header.png')});
    }
  }
  assert.deepEqual(errors,[]);
  console.log('event-compact-header-ui.test.js: OK');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve))}})().catch(error=>{console.error(error);process.exitCode=1});
