const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{
 const file=path.resolve(root,new URL(req.url,'http://localhost').pathname.slice(1)||'index.html');
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return res.writeHead(404).end();
 res.setHeader('Content-Type',path.extname(file)==='.js'?'application/javascript':'text/html');fs.createReadStream(file).pipe(res);
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{for(const viewport of [{width:390,height:844},{width:1366,height:768}])for(const view of ['full','summary']){
  const context=await browser.newContext({viewport,serviceWorkers:'block'}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/**',r=>r.fulfill({status:200,contentType:'application/json',body:'{"enabled":false}'}));
  await page.goto(process.env.TEST_BASE_URL||`http://127.0.0.1:${server.address().port}/`);
  await page.evaluate(view=>{
   const sections=Array.from({length:30},(_,i)=>({label:'Verso',lines:[{lyrics:`Frase real número ${i}`,chords:[{chord:'C',position:0},{chord:'G/B',position:5}]}]}));
   for(const id of ['selected-1','selected-2'])musicas.push(songFormat.toLegacy(songFormat.normalize({id,title:id,originalKey:'C',sections,fullChordSheet:{content:Array.from({length:70},()=> 'C G/B\nLetra completa diferente').join('\n')}})));
   setlists.push(eventModel.create({id:'selected-event',title:'Evento local',musicas:['selected-1','selected-2'],members:[{...appCurrentUser,isLeader:true}],leaderId:appCurrentUser.id}));
   openDetailFromPlaylist('selected-event',0);setSongView(view);
  },view);
  const before=await page.evaluate(()=>JSON.stringify(musicas.filter(s=>String(s.id).startsWith('selected-'))));
  await page.locator('#btn-palco').click();
  assert.equal(await page.evaluate(()=>currentSongView),view);
  assert.equal(await page.locator('.full-chord-sheet').count(),view==='full'?1:0);
  assert.equal(await page.locator('#modal-overlay').isVisible(),false);
  if(view==='summary'){
   const rows=await page.locator('.wa-block').first().innerText();
   assert.match(rows,/^Frase real número 0\nC/);assert.doesNotMatch(rows,/Verso|Seção|Trecho/);
   assert.ok(await page.locator('#view-detail').evaluate(el=>el.scrollWidth<=el.clientWidth));
  }
  const initial=await page.locator('#detail-content').innerText();
  await page.locator('#stage-capo-plus').click();assert.notEqual(await page.locator('#detail-content').innerText(),initial);
  await page.locator('#stage-capo-minus').click();assert.equal(await page.locator('#detail-content').innerText(),initial);
  await page.locator('#stage-performance-header').getByRole('button',{name:'Subir o tom',exact:true}).click();
  assert.notEqual(await page.locator('#detail-content').innerText(),initial);
  await page.locator('#stage-performance-header').getByRole('button',{name:'Descer o tom',exact:true}).click();
  const header=await page.locator('#stage-performance-header').boundingBox();
  await page.locator('#stage-scroll-toggle').click();
  await page.waitForFunction(()=>document.getElementById('view-detail').scrollTop>8);
  await page.locator('#stage-scroll-toggle').click();
  assert.equal(await page.evaluate(()=>scrollTimer),null);
  assert.deepEqual(await page.locator('#stage-performance-header').boundingBox(),header);
  await page.locator('#stage-next').click();assert.equal(await page.evaluate(()=>currentDetailId),'selected-2');
  assert.equal(await page.evaluate(()=>currentSongView),view);
  await page.locator('#stage-prev').click();assert.equal(await page.evaluate(()=>currentDetailId),'selected-1');
  assert.equal(await page.evaluate(()=>currentSongView),view);
  await page.getByRole('button',{name:'Sair do Modo Palco',exact:true}).click();
  assert.equal(await page.evaluate(()=>currentSongView),view);
  assert.equal(await page.evaluate(()=>JSON.stringify(musicas.filter(s=>String(s.id).startsWith('selected-')))),before);
  assert.deepEqual(errors,[]);await context.close();
 }console.log('stage-selected-view: OK (both tabs, scroll, capo, transpose, playlist, mobile/desktop, no source mutation)');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
