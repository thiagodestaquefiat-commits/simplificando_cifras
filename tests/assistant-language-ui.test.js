const assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  try{
    const context=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844}}),page=await context.newPage(),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/api/**',route=>route.fulfill({json:{enabled:false,songs:[],events:[],bands:[]}}));
    await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({body:'',contentType:'text/css'}));
    await page.goto('http://127.0.0.1:4173/?assistant-language-test=1');await page.waitForFunction(()=>loginGateAuthReady&&window.roudyAssistantLanguage);
    await page.evaluate(()=>{
      continueWithoutLogin();musicas.push(songModel.create({id:'language-song',title:'Apagar esta música',artist:'Autor',key:'G',blocos:[{l:'Verso',c:'G C D'}]}));commitSongs(musicas);openDetail('language-song');
      window.__captures=[];window.__utterances=[];window.SpeechRecognition=class{start(){window.__captures.push(this);this.onstart?.();}stop(){this.onend?.();}emit(text){this.onresult?.({results:[[{transcript:text}]]});}};
      window.SpeechSynthesisUtterance=class{constructor(text){this.text=text;}};
      Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{cancel(){},speak(u){window.__utterances.push(u);}}});
    });
    const run=(text,options)=>page.evaluate(({text,options})=>roudyAssistant.run(text,options),{text,options});
    const click=()=>page.locator('#song-assistant-launch').click();
    const emit=text=>page.evaluate(text=>window.__captures.at(-1).emit(text),text);
    await click();await emit('será que você pode ajustar o andamento para noventa');await page.waitForFunction(()=>studyMetronome.getBpm()===90);
    await click();await emit('está rápido demais');await page.waitForFunction(()=>studyMetronome.getBpm()===85,'complaint uses recent BPM');
    assert.equal((await run('usar capo na casa dois e ritmo cento e vinte e cinco')).completed,2);assert.equal(await page.evaluate(()=>selectedCapo),2);assert.equal(await page.evaluate(()=>studyMetronome.getBpm()),125);
    assert.equal((await run('usar capo na casa dois e ritmo noventa e guardar meus ajustes')).completed,3);assert.equal(await page.locator('#detail-save-changes').isVisible(),false);
    assert.equal((await run('deixar cifras verdes')).ok,true);assert.equal(await page.evaluate(()=>loadAppSettings().chordColor),'green');
    assert.equal((await run('subir tom dois tons')).ok,true);assert.equal(await page.evaluate(()=>currentSemitones),4);assert.equal((await run('descer tom dois semitons')).ok,true);assert.equal(await page.evaluate(()=>currentSemitones),2);
    const before=await page.evaluate(()=>({capo:selectedCapo,bpm:studyMetronome.getBpm(),semi:currentSemitones}));
    await click();await page.evaluate(()=>window.__captures.at(-1).onresult?.({results:[[{transcript:'não quero mudar nada'},{transcript:'capotraste três'}]]}));await page.waitForFunction(()=>roudyAssistant.getLastActionResult()?.status==='blocked');assert.equal(await page.evaluate(()=>selectedCapo),before.capo,'an alternative cannot drop the main transcript negation');
    for(const phrase of ['não apagar esta música','ritmo em 999','usar capo na casa 20','ensaiar para amanhã e coloca bpm 90','escutar meu instrumento e apagar esta música'])assert.equal((await run(phrase)).ok,false,phrase);
    assert.deepEqual(await page.evaluate(()=>({capo:selectedCapo,bpm:studyMetronome.getBpm(),semi:currentSemitones})),before);
    await click();await emit('está difícil de ler');await page.waitForFunction(()=>roudyAssistant.getConversationState()?.kind==='command');
    assert.equal(await page.evaluate(()=>loadAppSettings().highContrast),false);const count=await page.evaluate(()=>window.__captures.length);await page.waitForTimeout(220);assert.equal(await page.evaluate(()=>window.__captures.length),count,'no listening before the question ends');
    await page.evaluate(()=>window.__utterances.at(-1).onend?.());await page.waitForFunction(n=>window.__captures.length===n+1,count);await emit('contraste');await page.waitForFunction(()=>loadAppSettings().highContrast===true);
    await run('preparar modo palco');const font=await page.evaluate(()=>detailStageFont);await run('está difícil de ler');assert.equal((await run('letra')).ok,true);assert.equal(await page.evaluate(()=>detailStageFont),Math.min(48,font+2));await run('encerrar modo palco');
    assert.equal((await run('escolher andamento')).awaitingResponse,true);await run('noventa');assert.equal(await page.evaluate(()=>studyMetronome.getBpm()),90);
    await run('mostrar cifra completa');assert.equal(await page.evaluate(()=>currentSongView),'full');
    assert.equal((await run('apagar esta música')).awaitingResponse,true);assert.equal(await page.evaluate(()=>musicas.some(s=>s.id==='language-song')),true);await run('cancelar');
    await run('abrir música Apagar esta música');assert.equal(await page.evaluate(()=>currentDetailId),'language-song','literal title never becomes deletion');
    const size=await page.evaluate(()=>musicas.length);assert.equal((await run('colar uma cifra')).ok,true);assert.equal(await page.locator('#ai-summary-overlay').isVisible(),true);assert.equal(await page.evaluate(()=>musicas.length),size,'opening creation never auto-saves');await page.evaluate(()=>aiHarmonicSummary.close());
    await page.evaluate(()=>{
      closeDetail();const date=new Date();date.setDate(date.getDate()+1);const iso=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
      setlists.push(...['Ensaio A','Ensaio B'].map((title,i)=>eventModel.create({id:'language-event-'+i,title,date:iso,leaderId:appCurrentUser.id,members:[{...appCurrentUser,isLeader:true}]})));
    });
    const agenda=await run('quero ensaiar para amanhã');assert.equal(agenda.awaitingResponse,true,JSON.stringify(agenda));assert.equal(await page.locator('#view-sd').isVisible(),false);await run('Ensaio B');assert.equal(await page.evaluate(()=>currentSdId),'language-event-1');assert.equal(await page.locator('#view-sd').isVisible(),true);
    await page.evaluate(()=>{closeSD();openDetail('language-song');});assert.equal((await run('personalizar meu perfil')).ok,true);assert.equal(await page.locator('#profile-name').isVisible(),true);assert.equal(await page.locator('#song-assistant-launch').isVisible(),false,'voice icon stays hidden in profile');await page.evaluate(()=>closeModal());
    assert.deepEqual(errors,[]);console.log('assistant-language-ui: OK (icon, natural parameters, ambiguity/TTS, multi-action validation, typed generation, dates/choice, literal names and profile)');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
