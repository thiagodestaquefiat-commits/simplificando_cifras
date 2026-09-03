const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
assert.doesNotMatch(html, /openStageConfiguration|renderStageConfiguration|stageConfigDraft|Configurar Modo Palco|reconfigureStageMode/);
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const file = path.resolve(root, pathname === '/' ? 'index.html' : pathname.slice(1));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return res.writeHead(404).end();
  res.setHeader('Content-Type', ({'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.png':'image/png','.webmanifest':'application/manifest+json'})[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const executablePath = [process.env.BROWSER_EXECUTABLE, 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].find(p => p && fs.existsSync(p));
  const browser = await chromium.launch({headless:true, executablePath});
  try {
    for (const viewport of [{width:390,height:844},{width:768,height:1024},{width:1366,height:768}]) {
      const context = await browser.newContext({viewport});
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.route('**/api/**', route => route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({enabled:false,provider:'local'})}));
      await page.route('https://fonts.googleapis.com/**', route => route.fulfill({status:200,contentType:'text/css',body:''}));
      await page.goto(`http://127.0.0.1:${server.address().port}/`);
      await page.evaluate(() => {
        const song = songModel.create({id:'stage-test',title:'Teste de palco',key:'C',youtubeVideoId:'video-123',blocos:[{l:'Refrão',c:'C G Am F\nFrase do resumo'}],fullChordSheet:{visibility:'private',source:'user_text',content:'INTRO\nC G Am F\nLetra completa do teste'}});
        musicas.push(song);
        stagePreferences.save(appCurrentUser.id,{contentMode:'lyrics',autoScroll:true,fullscreen:true,showNext:false});
        openDetail(song.id);
        setSongView('full');
      });
      await page.locator('#btn-palco').click();
      assert.equal(await page.locator('#view-detail.stage-mode').count(),1);
      assert.equal(await page.locator('#modal-overlay').isVisible(),false);
      assert.match(await page.locator('#detail-content').innerText(),/Letra completa do teste/);
      assert.deepEqual(await page.evaluate(() => [scrollTimer,activeStagePreferences.contentMode,document.fullscreenElement]),[null,'lyrics-chords',null]);
      await page.getByRole('button',{name:'Sair do Modo Palco',exact:true}).click();
      assert.equal(await page.locator('#youtube-song-player.is-linked').isVisible(),true);
      await page.evaluate(() => {
        setlists.push(eventModel.create({id:'stage-event',title:'Repertório',musicas:['stage-test',1],members:[{...appCurrentUser,isLeader:true}],leaderId:appCurrentUser.id}));
        closeDetail();openSD('stage-event');
      });
      await page.locator('.event-stage-entry').click();
      assert.equal(await page.locator('#view-detail.stage-mode').count(),1);
      await page.locator('#stage-next').click();
      assert.equal(await page.evaluate(() => String(currentDetailId)),'1');
      await page.locator('#stage-prev').click();
      assert.equal(await page.evaluate(() => currentDetailId),'stage-test');
      assert.equal(await page.locator('#view-detail.stage-mode').count(),1);
      assert.deepEqual(errors,[]);
      await context.close();
    }
    console.log('stage-direct-entry.test.js: OK (entrada direta, cifra completa, repertório, saída/YouTube e 3 viewports)');
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error(e); process.exitCode=1; });
