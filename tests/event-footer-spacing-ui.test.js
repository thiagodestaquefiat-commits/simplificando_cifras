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
  for(const width of [320,390,430,820]){
    await page.setViewportSize({width,height:844});
    for(const count of [0,1,2,6]){
      await page.evaluate(count=>{
        cleanupEventParticipantsMorph();
        appCurrentUser={id:'spacing-user',name:'Conta de teste',role:'Teclado'};
        musicas=[{id:'spacing-song',title:'Música de teste',artist:'ROUDY',key:'G',blocks:[]}];
        const members=Array.from({length:count},(_,n)=>({id:n===count-1?'spacing-user':'member-'+n,name:'Integrante '+(n+1),role:n===0?'Liderança':'Teclado'}));
        const event=eventModel.create({id:'spacing-event',title:'Evento de teste',date:'2099-11-24',leaderId:count>1?'member-0':'spacing-user',members,repertoire:[{id:'spacing-item',songId:'spacing-song',songData:musicas[0],shared:{key:'G'},personalEdits:{}}]});
        setlists=[event];openSD(event.id,{refreshChat:false});
      },count);
      await page.locator('.event-participants-section').waitFor();
      for(let n=0;n<3;n++){
        await page.locator('#view-sd').evaluate(node=>node.scrollTop=node.scrollHeight);
        await page.waitForTimeout(70);
      }
      const spacing=await page.locator('.event-participants-section').evaluate(section=>{
        const stage=section.querySelector('.event-participants-stage').getBoundingClientRect(),add=section.querySelector('.event-participants-add').getBoundingClientRect(),leave=section.querySelector('.event-leave-card')?.getBoundingClientRect(),body=section.parentElement;
        const previous=section.previousElementSibling?.getBoundingClientRect(),bounds=section.getBoundingClientRect();
        return {stageStyle:section.querySelector('.event-participants-stage').getAttribute('style'),addStyle:section.querySelector('.event-participants-add').getAttribute('style'),height:add.height,progress:section.style.getPropertyValue('--member-progress'),tail:stage.bottom-add.bottom,leaveGap:leave?leave.top-add.bottom:null,padding:parseFloat(getComputedStyle(body).paddingBottom),sectionGap:previous?bounds.top-previous.bottom:0};
      });
      assert.ok(spacing.tail>=-1&&spacing.tail<=9,JSON.stringify({width,count,spacing}));
      assert.ok(spacing.leaveGap===null||spacing.leaveGap>=10&&spacing.leaveGap<=22,JSON.stringify({width,count,spacing}));
      assert.equal(spacing.padding,24);
      assert.ok(spacing.sectionGap>=0&&spacing.sectionGap<=32);
      if(width===390&&[1,2].includes(count))await page.screenshot({path:path.join(shots,`event-footer-${count}.png`)});
    }
  }
  assert.deepEqual(errors,[]);
  console.log('event-footer-spacing-ui.test.js: OK');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve))}})().catch(error=>{console.error(error);process.exitCode=1});
