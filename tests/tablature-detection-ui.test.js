const assert=require('node:assert/strict');const {chromium}=require('playwright');
(async()=>{let browser;try{
  browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  const context=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/**',r=>r.fulfill({json:{enabled:false,songs:[],events:[],bands:[]}}));await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));
  await page.goto('http://127.0.0.1:4173/?teste-tablaturas=1',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>loginGateAuthReady&&window.tablature?.prepareSong);
  await page.evaluate(()=>{
    continueWithoutLogin();
    const rows=notes=>notes.map(n=>n+'|---0---3/5---|').join('\n');
    const content='Afinação: C G C F A D\n[Verso]\nC G\nLetra preservada\n[Solo]\n'+rows(['D','A','F','C','G','C'])+'\n[Riff 1]\n'+rows(['D','A','F','C','G','C'])+'\nInstrumento: ukulele\nAfinação: G C E A\n[Riff 2]\n'+rows(['A','E','C','G']);
    musicas.push(songModel.create({id:'tabs-fixture',title:'Teste de tablaturas',key:'C',blocos:[{l:'Verso',c:'C G'}],fullChordSheet:{content}}));openDetail('tabs-fixture');
  });
  assert.equal(await page.getByRole('tab',{name:'Tablaturas',exact:true}).count(),1);
  assert.match(await page.locator('.full-chord-sheet').textContent(),/Letra preservada/);
  assert.doesNotMatch(await page.locator('.full-chord-sheet').textContent(),/\|---/,'tablaturas saem da letra');
  await page.getByRole('tab',{name:'Tablaturas',exact:true}).click();
  assert.deepEqual(await page.locator('.tablature-section h3').allTextContents(),['Solo','Riff 1']);
  assert.match(await page.locator('.tablature-toolbar').textContent(),/C G C F A D/);
  await page.evaluate(()=>setInstrument('keyboard'));assert.equal(await page.getByRole('tab',{name:'Tablaturas',exact:true}).count(),0);
  await page.evaluate(()=>setSongView('full'));assert.doesNotMatch(await page.locator('.full-chord-sheet').textContent(),/\|---/);
  await context.setOffline(true);await page.evaluate(()=>setInstrument('ukulele'));await page.getByRole('tab',{name:'Tablaturas',exact:true}).click();
  assert.deepEqual(await page.locator('.tablature-section h3').allTextContents(),['Riff 2']);
  await page.evaluate(()=>setInstrument('guitar'));await page.getByRole('tab',{name:'Tablaturas',exact:true}).click();assert.equal(await page.locator('.tablature-section').count(),2);
  assert.equal(await page.evaluate(()=>musicas.find(s=>s.id==='tabs-fixture').tablature.sections.length),3,'ocultar não exclui dados');
  assert.deepEqual(errors,[]);console.log('tablature-detection-ui.test.js: OK (extração, Drop C, títulos, instrumentos e offline móvel)');
}finally{await browser?.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
