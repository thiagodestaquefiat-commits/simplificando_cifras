const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  const file = path.resolve(root, pathname === '/' ? 'index.html' : pathname.slice(1));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return response.writeHead(404).end();
  response.setHeader('Content-Type', ({'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.webmanifest':'application/manifest+json'})[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(response);
});

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const executablePath = [process.env.BROWSER_EXECUTABLE, 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].find(value => value && fs.existsSync(value));
  const browser = await chromium.launch({ headless: true, executablePath });
  try {
    for (const viewport of [{width:390,height:844},{width:768,height:1024}]) {
      const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      let remoteKey='C',remoteVersion=1;
      const remoteEvent=()=>({id:'event-key',title:'Evento do teste',leaderId:'leader-test',creatorId:'leader-test',remoteVersion,members:[{id:'leader-test',name:'Líder',role:'Liderança',isLeader:true},{id:'other-member',name:'Outra pessoa',role:'Vocal'}],repertoire:[{id:'event-key-item',songId:'event-key-song',order:0,shared:{key:remoteKey,notes:'Entrada suave',chordSheet:remoteKey==='C'?'C F G\nUma letra':'Db Gb Ab\nUma letra'}}]});
      await page.route('**/api/collaboration/**', async route => {
        const request=route.request(),url=request.url();
        if(url.endsWith('/users')&&request.method()==='POST')return route.fulfill({status:201,contentType:'application/json',body:JSON.stringify({user:{id:'leader-test',name:'Líder'},accessToken:'test-token'})});
        if(url.endsWith('/events/event-key/repertoire/event-key-item/shared')&&request.method()==='PATCH'){
          remoteKey=JSON.parse(request.postData()).key;remoteVersion+=1;
          return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(remoteEvent())});
        }
        if(url.endsWith('/events/event-key')&&request.method()==='GET')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(remoteEvent())});
        return route.fulfill({status:404,contentType:'application/json',body:JSON.stringify({erro:{codigo:'nao_publicado',mensagem:'Backend de teste'}})});
      });
      await page.route('**/api/auth/config', route => route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({enabled:false,provider:'local'})}));
      await page.route('https://fonts.googleapis.com/**', route => route.fulfill({status:200,contentType:'text/css',body:''}));
      await page.goto(`http://127.0.0.1:${server.address().port}/`);
      await page.evaluate(() => {
        appCurrentUser=Object.freeze({...appCurrentUser,id:'leader-test',name:'Líder'});
        musicas.push(songModel.create({id:'event-key-song',title:'Canção do teste',key:'C',blocos:[{l:'',c:'C F G\nUma letra'}],fullChordSheet:{visibility:'private',source:'user_text',content:'C F G\nUma letra'}}));
        eventCollaboration.ensureLocalIdentity(appCurrentUser);
        setlists.push(eventModel.create({id:'event-key',title:'Evento do teste',leaderId:appCurrentUser.id,remoteVersion:1,members:[{...appCurrentUser,isLeader:true},{id:'other-member',name:'Outra pessoa',role:'Vocal'}],repertoire:[{id:'event-key-item',songId:'event-key-song',shared:{key:'C',notes:'Entrada suave',chordSheet:'C F G\nUma letra'}}]}));
        openSD('event-key');
      });
      assert.equal(await page.locator('.event-official-key-control').count(),1);
      assert.equal(await page.locator('.event-official-key-control output').innerText(),'C');
      await page.getByRole('button',{name:'Subir tom oficial de Canção do teste'}).click();
      await page.waitForFunction(() => findEvent('event-key').repertoire[0].shared.key === 'Db');
      assert.equal(await page.locator('.event-official-key-control output').innerText(),'Db');
      assert.deepEqual(await page.evaluate(() => ({notes:findEvent('event-key').repertoire[0].shared.notes,chordSheet:findEvent('event-key').repertoire[0].shared.chordSheet})),{notes:'Entrada suave',chordSheet:'Db Gb Ab\nUma letra'});
      const variant=await page.evaluate(() => eventSongVariant(findEvent('event-key'),findEvent('event-key').repertoire[0],appCurrentUser.id));
      assert.equal(variant.key,'Db');
      assert.match(variant.blocos[0].c,/Db\s+Gb\s+Ab/);
      assert.match(variant.fullChordSheet.content,/Db\s+Gb\s+Ab/);
      assert.equal(await page.evaluate(() => musicas.find(song => song.id === 'event-key-song').key),'C');
      remoteKey='D';remoteVersion+=1;
      await page.evaluate(() => {currentAuthState={...currentAuthState,authenticated:true};return refreshOpenEventFromCloud();});
      await page.waitForFunction(() => findEvent('event-key').repertoire[0].shared.key === 'D');
      assert.equal(await page.locator('.event-official-key-control output').innerText(),'D');
      const chatBounds=await page.locator('#event-chat-fab').boundingBox();
      const bellBounds=await page.locator('#event-notification-button').boundingBox();
      assert.ok(chatBounds.x+chatBounds.width<=bellBounds.x&&chatBounds.width===bellBounds.width&&chatBounds.height===bellBounds.height);
      await page.evaluate(() => {
        const current=appCurrentUser;
        appCurrentUser=Object.freeze({id:'other-member',name:'Outra pessoa',role:'Vocal'});
        eventChat.sendText('event-key','Mensagem de teste');
        appCurrentUser=current;
        openSD('event-key');
      });
      assert.equal(await page.locator('#event-chat-fab .event-chat-fab-badge').innerText(),'1');
      await page.locator('#event-chat-fab').click();
      assert.equal(await page.locator('#event-chat-fab .event-chat-fab-badge').count(),0);
      await page.evaluate(() => {
        closeEventChat();
        const original=findEvent('event-key');
        setlists=eventRepository.upsert(setlists,eventModel.create({...original,id:'event-key-member',leaderId:'other-member'})).events;
        openSD('event-key-member');
      });
      assert.equal(await page.locator('.event-official-key-control').count(),0);
      await page.evaluate(() => changeEventOfficialKey('event-key-member','event-key-item',1));
      assert.equal(await page.evaluate(() => findEvent('event-key-member').repertoire[0].shared.key),'D');
      assert.deepEqual(errors,[]);
      await context.close();
    }
    console.log('event-official-key-ui.test.js: OK (tom oficial, permissão e chat em 2 viewports)');
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); process.exitCode=1; });
