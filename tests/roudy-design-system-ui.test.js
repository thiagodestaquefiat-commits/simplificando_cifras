// Integration checks for the shared visual roles and responsive component owners.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const {chromium} = require('playwright');
const root = path.resolve(__dirname, '..');
const types = {'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'};
const server = http.createServer((req,res) => {
  const file = path.resolve(root, new URL(req.url,'http://localhost').pathname.slice(1) || 'index.html');
  if(!file.startsWith(root+path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return res.writeHead(404).end();
  res.writeHead(200,{'Content-Type':types[path.extname(file)] || 'application/octet-stream'});
  fs.createReadStream(file).pipe(res);
});
(async()=>{
  let browser;
  try {
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    browser = await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
    const page = await browser.newPage({viewport:{width:390,height:844},serviceWorkers:'block'});
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/api/**',route=>route.fulfill({contentType:'application/json',body:'{}'}));
    await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({contentType:'text/css',body:''}));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const appearance=selector=>page.locator(selector).first().evaluate(node=>{
      const s=getComputedStyle(node);
      return {font:s.fontFamily,weight:s.fontWeight,bg:s.backgroundColor,color:s.color,height:node.getBoundingClientRect().height};
    });
    assert.match((await appearance('#login-gate h1')).font,/^Manrope/);
    assert.equal((await appearance('#login-gate h1')).weight,'800');
    assert.match((await appearance('.login-google-button')).font,/^Inter/);
    assert.equal((await appearance('.login-google-button')).weight,'600');
    await page.getByRole('button',{name:'Continuar sem login',exact:true}).click();
    assert.equal((await appearance('body')).bg,'rgb(11, 11, 12)');
    assert.match((await appearance('.home-playlists-header h2')).font,/^Manrope/);
    await page.locator('#tab-search').click();
    await page.waitForTimeout(250);
    for(const width of [320,375,390,430,768,1440]) {
      await page.setViewportSize({width,height:844});
      assert.match((await appearance('.roudy-search-title')).font,/^Manrope/);
      const captions = await page.locator('.roudy-search-shortcut-copy small').evaluateAll(nodes=>nodes.map(node=>{
        const s=getComputedStyle(node);return {font:s.fontFamily,weight:s.fontWeight,width:node.clientWidth,scroll:node.scrollWidth};
      }));
      assert.equal(captions.length,4);
      captions.forEach(c=>{assert.match(c.font,/^Inter/);assert.equal(c.weight,'400');assert.ok(c.scroll<=c.width+1);});
      assert.equal((await appearance('.roudy-search-scroll')).bg,'rgb(11, 11, 12)');
      await page.locator('#roudy-search-input').click();
      assert.equal((await appearance('.roudy-search-field')).bg,'rgb(36, 36, 38)');
      assert.equal((await appearance('.roudy-search-scroll')).bg,'rgb(11, 11, 12)');
      await page.getByRole('button',{name:'Cancelar',exact:true}).click();
      assert.equal((await appearance('.roudy-search-field')).bg,'rgb(65, 64, 71)');
    }
    await page.setViewportSize({width:390,height:844});
    await page.evaluate(()=>roudySearchMenu.close());
    await page.waitForTimeout(260);
    await page.evaluate(()=>openAddMusica());
    assert.equal((await appearance('.modal')).bg,'rgb(25, 26, 28)');
    assert.equal((await appearance('#fm-title')).bg,'rgb(36, 36, 38)');
    assert.ok((await appearance('#fm-title')).height>=44);
    assert.match((await appearance('.modal-title')).font,/^Inter/);
    await page.locator('#fm-title').fill('Título preservado');
    assert.equal(await page.locator('#fm-title').inputValue(),'Título preservado');
    // A token change reaches both the modal and the new-event sheet without priority hacks.
    await page.evaluate(()=>document.documentElement.style.setProperty('--ui-surface','rgb(31, 32, 33)'));
    assert.equal((await appearance('.modal')).bg,'rgb(31, 32, 33)');
    await page.evaluate(()=>{closeModal();openNewEventCreateSheet();});
    assert.equal((await appearance('.event-admin-sheet')).bg,'rgb(31, 32, 33)');
    assert.equal((await appearance('#event-create-title')).bg,'rgb(36, 36, 38)');
    await page.evaluate(()=>{
      closeEventAdminSheet();document.documentElement.style.removeProperty('--ui-surface');
      musicas=[{id:'design-study',title:'Teste de leitura',artist:'ROUDY',key:'C',content:'C G\nA casa é sua',sections:[]}];
      openDetail('design-study');
    });
    const musicalFonts=await page.locator('#detail-content .full-chord-line').evaluateAll(nodes=>nodes.map(node=>getComputedStyle(node).fontFamily));
    musicalFonts.forEach(font=>assert.match(font,/JetBrains Mono|monospace|Inter/));
    await page.evaluate(()=>{
      const event=eventModel.create({id:'design-event',title:'Ensaio ROUDY',date:'2026-12-20',leaderId:appCurrentUser.id,members:[{...appCurrentUser,isCurrentUser:true,isLeader:true}],repertoire:[]});
      setlists=[event];openSD(event.id);
    });
    assert.match((await appearance('#sd-title')).font,/^Manrope/);
    assert.equal((await appearance('#sd-title')).weight,'800');
    assert.equal(await page.locator('#sd-title').textContent(),'Ensaio ROUDY');
    // Existing high-contrast and light-mode mechanisms remain available.
    await page.evaluate(()=>document.documentElement.classList.add('a11y-high-contrast'));
    assert.match((await appearance('#sd-title')).font,/^Manrope/);
    assert.equal((await appearance('#sd-title')).weight,'800');
    await page.evaluate(()=>{document.documentElement.classList.remove('a11y-high-contrast');document.documentElement.dataset.theme='light';});
    assert.match(await page.locator('html').evaluate(node=>getComputedStyle(node).filter),/invert/);
    assert.deepEqual(errors,[]);
    console.log('roudy-design-system-ui.test.js: OK (roles, six widths, form ownership, tokens and reading)');
  } finally {
    if(browser) await browser.close();
    await new Promise(resolve=>server.close(resolve));
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
