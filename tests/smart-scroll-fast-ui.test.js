const assert=require('node:assert/strict'),fs=require('node:fs');const {chromium}=require('playwright');
(async()=>{let browser;try{
  browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  const page=await(await browser.newContext({serviceWorkers:'block'})).newPage();
  await page.route('**/api/**',r=>r.fulfill({json:{enabled:false,songs:[],events:[],bands:[]}}));await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));
  await page.route('**/js/tuner.js*',r=>r.fulfill({contentType:'application/javascript',body:fs.readFileSync('js/tuner.js','utf8')+'\nwindow.appTuner={...window.appTuner,create:()=>({start:async callback=>{window.__audioSample=callback;return true;},stop(){},isRunning:()=>false})};'}));
  await page.goto('http://127.0.0.1:4173/?teste-resposta-rapida=1',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>loginGateAuthReady&&window.smartScroll);
  await page.evaluate(()=>{continueWithoutLogin();musicas.push({id:'fast-fixture',title:'Resposta rápida',key:'A',blocos:[{l:'Verso',c:'A D A'}]});openDetail('fast-fixture');});
  await page.locator('#btn-smart-scroll').click();await page.waitForFunction(()=>smartScrollController.isActive());
  await page.evaluate(()=>{
    const spectrum=new Float32Array(2048).fill(-110);
    for(const [midi,amp] of [[45,1],[52,.8],[57,.55],[61,.12],[64,.35]])for(let h=1;h<=5;h++){
      const bin=440*2**((midi-69)/12)*h*4096/48000;
      for(let i=Math.floor(bin)-1;i<=Math.ceil(bin)+1;i++)spectrum[i]=Math.max(spectrum[i],-25+20*Math.log10(amp/h**1.5)-15*(i-bin)**2);
    }
    window.__testClock=0;Object.defineProperty(performance,'now',{value:()=>window.__testClock,configurable:true});
    window.__frame={spectrum,sampleRate:48000,fftSize:4096,rms:.05};
    window.__audioSample(null,window.__frame);
  });
  assert.equal(await page.locator('.smart-chord-played').count(),0,'uma análise isolada ainda não marca verde');
  await page.evaluate(()=>{for(const time of [30,60,90,119]){window.__testClock=time;window.__audioSample(null,window.__frame);}});
  assert.equal(await page.evaluate(()=>smartScrollController.tracker.getIndex()),0,'ainda aguarda 120 ms');
  await page.evaluate(()=>{window.__testClock=120;window.__audioSample(null,window.__frame);});
  assert.equal(await page.locator('.smart-chord-played').count(),1,'verde aparece com 120 ms consistentes');
  assert.equal(await page.evaluate(()=>smartScrollController.tracker.getIndex()),1,'confirma antes dos antigos 250 ms');
  assert.match(await page.locator('#smart-scroll-status').textContent(),/Próximo: D/);
  console.log('smart-scroll-fast-ui.test.js: OK (pico isolado rejeitado, 120 ms confirmam A)');
}finally{await browser?.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
