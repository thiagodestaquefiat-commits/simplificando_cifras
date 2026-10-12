const assert=require('node:assert/strict'),{chromium}=require('playwright');
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  try{
    const page=await browser.newPage({serviceWorkers:'block'}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/api/**',r=>r.fulfill({json:{enabled:false,songs:[],events:[],bands:[]}}));
    await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));
    await page.goto('http://127.0.0.1:4173/?voz-direta-teste=1');await page.waitForFunction(()=>loginGateAuthReady&&window.roudyAssistant);
    await page.evaluate(()=>{
      continueWithoutLogin();musicas.push(songModel.create({id:'direct-voice-song',title:'Canção sem chamada',key:'C',blocos:Array.from({length:30},()=>({l:'Verso',c:'C G Am F'}))}));openDetail('direct-voice-song');
      assistantVoice.toggle(false);
      window.SpeechRecognition=class{start(){window.__voiceCapture=this;this.onstart?.();}stop(){this.onend?.();}emit(text){this.onresult?.({results:[[{transcript:text}]]});}};
    });
    const say=async(text,check)=>{await page.locator('#song-assistant-launch').click();await page.evaluate(text=>window.__voiceCapture.emit(text),text);await page.waitForFunction(check);assert.equal(await page.evaluate(()=>roudyAssistant.getConversationState()),null,'comando completo não exige acompanhamento');};
    await say('mudar a cor da cifra para azul',()=>loadAppSettings().chordColor==='blue');
    await say('metrônomo em noventa e dois',()=>studyMetronome.getBpm()===92);
    await say('capotraste na casa dois',()=>Number(selectedCapo)===2);
    await say('iniciar rolagem automática',()=>scrollTimer!==null);
    await say('interromper rolagem automática',()=>scrollTimer===null);
    await say('mudar idioma para inglês',()=>document.documentElement.lang==='en');
    await say('mudar idioma para português',()=>document.documentElement.lang==='pt-BR');
    await say('Rôudi, mudar a cor da cifra para verde',()=>loadAppSettings().chordColor==='green');
    assert.deepEqual(errors,[]);console.log('assistant-direct-voice-ui: OK (clique + voz simulada, cor, BPM, capo, rolagem, idioma e nome opcional)');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
