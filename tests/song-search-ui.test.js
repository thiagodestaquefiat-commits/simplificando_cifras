const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  const file = path.resolve(root, pathname === '/' ? 'index.html' : decodeURIComponent(pathname.slice(1)));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return response.writeHead(404).end();
  response.setHeader('Content-Type', ({ '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' })[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(response);
});


(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{
 for(const width of [375,390,430,820]){
  const context=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block'}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/api/**',route=>route.fulfill({status:200,contentType:'application/json',body:'{}'}));
  await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({status:200,contentType:'text/css',body:''}));
  await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>typeof continueWithoutLogin==='function'&&window.roudySearchMenu);
  await page.evaluate(()=>{
   continueWithoutLogin();musicas=[];window.__opens=0;window.__saves=0;
   window.harmonicSummaryClient={catalogVersions:async()=>[{id:'c1',title:'Horizonte de luz — versão de teste com título muito longo',artist:'Artista de teste com nome longo',key:'C'}],searchSources:async()=>[],catalogVersion:async()=>({}),responseToEditorModel:()=>({title:'Horizonte de luz — versão de teste com título muito longo',artist:'Artista de teste com nome longo',key:'C',sections:[]})};
   Object.assign(searchLibraryBridge,{owner:()=> 'test',toSong:model=>model,confirmed:s=>!!s.librarySync?.syncedAt,persist:next=>{musicas=next;window.__saves++;return true;},sync:async()=>{musicas=musicas.map(s=>({...s,librarySync:{syncedAt:'test',serverVersion:1}}));},openSong:()=>window.__opens++,openDraft:()=>window.__opens++});
   openPrimarySearchTab();roudySearchMenu.activate();
  });
  const input=page.locator('#roudy-search-input');await input.fill('Horizonte');
  await page.waitForFunction(()=>document.querySelectorAll('.roudy-search-song-row').length===1&&document.querySelector('#roudy-search-results').getAttribute('aria-busy')!== 'true');
  assert.equal(await page.locator('.roudy-search-suggestion').count(),2);
  assert.equal(await page.locator('.roudy-search-filters').count(),0);
  const button=page.locator('.roudy-search-save');assert.equal(await button.getAttribute('data-state'),'new');
  await button.click();await page.waitForFunction(()=>document.querySelector('.roudy-search-save').dataset.state==='saved');
  assert.equal(await page.evaluate(()=>window.__opens),0,'adding does not open');assert.equal(await page.evaluate(()=>window.__saves),1);
  await page.locator('.roudy-search-song-open').click();assert.equal(await page.evaluate(()=>window.__opens),1);
  const metrics=await page.locator('#roudy-search').evaluate(root=>({width:root.clientWidth,scroll:root.scrollWidth,touch:[...root.querySelectorAll('.roudy-search-save,.roudy-search-song-open,.roudy-search-clear,.roudy-search-cancel')].filter(e=>e.getBoundingClientRect().height).map(e=>e.getBoundingClientRect().height)}));
  assert.ok(metrics.scroll<=metrics.width,`${width}: horizontal overflow`);assert.ok(metrics.touch.every(h=>h>=44));
  if(width===390&&process.env.REVIEW_SCREENSHOT)await page.screenshot({path:process.env.REVIEW_SCREENSHOT});
  await page.locator('#roudy-search-clear').click();assert.equal(await input.inputValue(),'');
  await input.fill('Nenhum');
  await page.evaluate(()=>{window.harmonicSummaryClient.catalogVersions=async()=>[];window.harmonicSummaryClient.searchSources=async()=>[];roudySearchMenu.input();});
  await page.waitForFunction(()=>document.querySelector('#roudy-search-feedback').textContent.includes('Nenhuma música encontrada'));
  await page.evaluate(()=>{window.harmonicSummaryClient.searchSources=async()=>{throw Error('offline')};roudySearchMenu.input();});
  await page.waitForFunction(()=>document.querySelector('#roudy-search-feedback').textContent.includes('conexão'));
  await page.setViewportSize({width,height:480});
  const field=await input.boundingBox();assert.ok(field.y>=0&&field.y+field.height<480,'field remains accessible with smaller keyboard-sized viewport');
  await input.blur();assert.equal(await input.isVisible(),true);
  await page.locator('.roudy-search-cancel').click();assert.equal(await page.locator('#roudy-search').evaluate(e=>e.classList.contains('is-active')),false);
  assert.deepEqual(errors,[]);await context.close();
 }
 console.log('song-search-ui.test.js: OK (375/390/430/820, real page, suggestions, open/save, touch targets, clear/cancel)');
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;server.close();});
