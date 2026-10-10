const assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  try{
    const context=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844}}),page=await context.newPage(),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/api/**',route=>route.fulfill({json:{enabled:false,songs:[],events:[],bands:[]}}));
    await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({body:'',contentType:'text/css'}));
    await page.goto('http://127.0.0.1:4173/?assistant-memory-test=1');await page.waitForFunction(()=>loginGateAuthReady&&window.roudyAssistantMemory);
    await page.evaluate(()=>{
      continueWithoutLogin();musicas.push(...['memory-song','memory-other'].map((id,i)=>songModel.create({id,title:i?'Verde':'Memória de teste',artist:'Autor',key:'G',blocos:[{l:'Verso',c:'G C D'}]})));commitSongs(musicas);openDetail('memory-song');
      window.__captures=[];window.__utterances=[];window.SpeechRecognition=class{start(){window.__captures.push(this);this.onstart?.();}stop(){this.onend?.();}emit(text){this.onresult?.({results:[[{transcript:text}]]});}};
      window.SpeechSynthesisUtterance=class{constructor(text){this.text=text;}};
      Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{cancel(){},speak(utterance){window.__utterances.push(utterance);}}});
    });
    const run=(text,options)=>page.evaluate(({text,options})=>roudyAssistant.run(text,options),{text,options});
    const click=()=>page.locator('#song-assistant-launch').click();
    const emit=text=>page.evaluate(text=>window.__captures.at(-1).emit(text),text);
    await click();await emit('metrônomo em noventa');await page.waitForFunction(()=>studyMetronome.getBpm()===90);
    const originalSpeed=await page.evaluate(()=>scrollSpeed);
    await click();await emit('aumenta um pouco');await page.waitForFunction(()=>studyMetronome.getBpm()===95);assert.equal(await page.evaluate(()=>scrollSpeed),originalSpeed);
    assert.equal(await page.evaluate(()=>roudyAssistant.getConversationState()),null,'recent unambiguous control executes directly');
    assert.equal((await run('desfazer')).ok,true);assert.equal(await page.evaluate(()=>studyMetronome.getBpm()),90);
    await run('cor da cifra azul');assert.equal((await run('prefiro verde')).ok,true);assert.equal(await page.evaluate(()=>loadAppSettings().chordColor),'green');assert.equal(await page.evaluate(()=>currentDetailId),'memory-song','correction does not open same-name music');
    await run('abrir música Verde');assert.equal(await page.evaluate(()=>currentDetailId),'memory-other','explicit title still opens song');await page.evaluate(()=>{closeDetail();openDetail('memory-song');});
    await run('bpm 90');await run('cancelar');
    await click();await emit('deixa mais rápido');await page.waitForFunction(()=>roudyAssistant.getConversationState()?.kind==='command');
    assert.equal(await page.evaluate(()=>studyMetronome.getBpm()),90,'ambiguous request must not change BPM');assert.equal(await page.evaluate(()=>scrollSpeed),originalSpeed);
    const captures=await page.evaluate(()=>window.__captures.length);await page.waitForTimeout(230);assert.equal(await page.evaluate(()=>window.__captures.length),captures,'no listening before question finishes');
    await page.evaluate(()=>window.__utterances.at(-1).onend?.());await page.waitForFunction(n=>window.__captures.length===n+1,captures);await emit('rolagem');await page.waitForFunction(speed=>scrollSpeed===speed+3,originalSpeed);assert.equal(await page.evaluate(()=>studyMetronome.getBpm()),90);assert.equal(await page.evaluate(()=>roudyAssistant.getConversationState()),null);
    await run('bpm 100');await page.evaluate(()=>studyMetronome.setBpm(110));assert.equal((await run('mais rápido')).awaitingResponse,true);assert.equal(await page.evaluate(()=>studyMetronome.getBpm()),110);await run('cancelar');
    await run('bpm 90');await page.evaluate(()=>{window.__originalNow=Date.now;const instant=Date.now()+46000;Date.now=()=>instant;});assert.equal((await run('prefiro 100')).ok,false);assert.equal(await page.evaluate(()=>studyMetronome.getBpm()),90);await page.evaluate(()=>{Date.now=window.__originalNow;});
    await run('cor da cifra azul');await page.evaluate(()=>{closeDetail();openDetail('memory-song');});assert.equal((await run('prefiro verde')).ok,false,'closing and returning invalidates reference');
    await page.evaluate(()=>{
      closeDetail();const today=new Date(),date=`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
      window.__playlistBefore=JSON.stringify(musicas);
      const song=musicas.find(s=>s.id==='memory-song'),other=musicas.find(s=>s.id==='memory-other');
      setlists.push(eventModel.create({id:'memory-event',title:'Evento da memória',date,leaderId:appCurrentUser.id,members:[{...appCurrentUser,isLeader:true}],repertoire:[{id:'memory-i1',songId:song.id,shared:eventEditFromSong(eventSongCopy(song))},{id:'memory-i2',songId:other.id,shared:eventEditFromSong(eventSongCopy(other))}]}));
    });
    assert.equal((await run('abra o evento de hoje')).ok,true);assert.equal(await page.locator('#view-sd').isVisible(),true);
    assert.equal((await run('abra a primeira música')).ok,true);assert.equal(await page.locator('#view-detail').isVisible(),true);assert.equal(await page.locator('#view-sd').isVisible(),false,'song is directly visible, not opened behind event');
    assert.deepEqual(await page.evaluate(()=>({eventId:detailEventContext.eventId,itemId:detailEventContext.itemId})),{eventId:'memory-event',itemId:'memory-i1'});
    await run('bpm 90');await run('aumentar um pouco');assert.equal((await run('salvar alterações')).saveScope,'event-personal');assert.equal(await page.evaluate(()=>JSON.stringify(musicas)===window.__playlistBefore),true,'contextual event edit preserves playlist');
    assert.equal((await run('abrir última música')).ok,true);assert.equal(await page.evaluate(()=>detailEventContext.itemId),'memory-i2');assert.equal((await run('abrir música número três')).ok,false);
    await page.evaluate(()=>{closeDetail();openDetail('memory-song');});assert.equal((await run('abrir primeira música')).ok,false,'no stale event behind playlist song');
    await run('cor da cifra azul');await page.evaluate(()=>{appCurrentUser=Object.freeze({...appCurrentUser,id:'other-account'});});assert.equal((await run('prefiro verde')).ok,false);assert.equal(await page.evaluate(()=>loadAppSettings().chordColor),'blue');
    assert.deepEqual(errors,[]);console.log('assistant-memory-ui: OK (icon + simulated speech, recent reference, TTS ambiguity, expiry, manual conflict, event navigation/isolation and accounts)');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
