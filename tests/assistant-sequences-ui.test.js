const assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  try{
    const context=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844}}),page=await context.newPage(),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/api/**',route=>route.fulfill({json:{enabled:false,songs:[],events:[],bands:[]}}));
    await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({body:'',contentType:'text/css'}));
    await page.goto('http://127.0.0.1:4173/?assistant-sequences-test=1');await page.waitForFunction(()=>loginGateAuthReady&&window.roudyAssistantSequences);
    await page.evaluate(()=>{
      continueWithoutLogin();musicas.push(songModel.create({id:'sequence-song',title:'Sequência de teste',artist:'Autor',key:'G',blocos:[{l:'Verso',c:'G C D'}]}));commitSongs(musicas);openDetail('sequence-song');
      window.__recognitions=[];window.SpeechRecognition=class{start(){window.__recognitions.push(this);this.onstart?.();}stop(){this.onend?.();}emit(text){this.onresult?.({results:[[{transcript:text}]]});}};
    });
    const run=(text,options)=>page.evaluate(({text,options})=>roudyAssistant.run(text,options),{text,options});
    const read=()=>page.evaluate(()=>({capo:selectedCapo,semitones:currentSemitones,bpm:studyMetronome.getBpm(),meter:studyMetronome.getMeter()}));
    const initial=await read(),initialColor=await page.evaluate(()=>loadAppSettings().chordColor);
    assert.equal((await run('capotraste 3 e bpm 90 e compasso 7 por 8')).ok,false);assert.deepEqual(await read(),initial,'invalid last step must leave all controls untouched');
    await page.locator('#song-assistant-launch').click();
    await page.evaluate(()=>window.__recognitions.at(-1).emit('coloque o capotraste na casa dois, ajuste o metrônomo em cento e vinte e cinco e salve as alterações'));
    await page.waitForFunction(()=>roudyAssistant.getLastActionResult()?.action==='assistant.sequence');
    const speech=await page.evaluate(()=>roudyAssistant.getLastActionResult());assert.equal(speech.completed,3,JSON.stringify(speech));assert.equal(speech.ok,true);
    assert.equal((await read()).capo,2);assert.equal((await read()).bpm,125);assert.equal(await page.locator('#detail-save-changes').isVisible(),false);
    assert.equal((await run('desfaça a última alteração')).ok,true);assert.deepEqual(await read(),initial);assert.equal(await page.locator('#detail-save-changes').isVisible(),true,'undo after save produces an unsaved draft');
    assert.equal(await page.evaluate(()=>musicas.find(song=>song.id==='sequence-song').playbackSettings.capo),2,'undo never overwrites persisted state silently');
    await run('salvar alterações');
    await run('mudar cor');await run('azul');await run('desfazer');assert.equal(await page.evaluate(()=>loadAppSettings().chordColor),initialColor);
    await run('subir tom');await run('desfazer');assert.equal((await read()).semitones,initial.semitones);
    await run('capotraste 4');await page.evaluate(()=>selectCapo(5));assert.equal((await run('desfazer')).ok,false);assert.equal((await read()).capo,5);
    await run('capotraste 6');await page.evaluate(()=>{closeDetail();openDetail('sequence-song');});assert.equal((await run('desfazer')).ok,false,'history invalidated when leaving even if same song reopened');
    await page.evaluate(()=>{
      window.__playlistBefore=JSON.stringify(musicas);const song=musicas.find(s=>s.id==='sequence-song');
      setlists.push(eventModel.create({id:'sequence-event',title:'Evento de teste',date:'2030-10-10',leaderId:appCurrentUser.id,members:[{...appCurrentUser,isLeader:true}],repertoire:[{id:'sequence-item',songId:song.id,shared:eventEditFromSong(eventSongCopy(song))}]}));closeDetail();openDetailFromEventItem('sequence-event','sequence-item');
    });
    const eventInitial=await read();assert.equal((await run('capotraste 4 e bpm 99 e salvar')).ok,true);assert.equal(await page.evaluate(()=>JSON.stringify(musicas)===window.__playlistBefore),true);
    assert.equal((await run('desfazer')).ok,true);assert.deepEqual(await read(),eventInitial);assert.equal(await page.locator('#detail-save-changes').isVisible(),true);assert.equal(await page.evaluate(()=>JSON.stringify(musicas)===window.__playlistBefore),true);
    await run('salvar');await page.evaluate(()=>{closeDetail();openDetailFromEventItem('sequence-event','sequence-item');});assert.deepEqual(await read(),eventInitial);
    await page.evaluate(()=>{window.__repo=songRepository;closeDetail();openDetail('sequence-song');window.songRepository=Object.freeze({...songRepository,save:()=>false});});
    const failed=await run('capotraste 3 e bpm 88 e salvar');assert.equal(failed.ok,false);assert.equal(failed.completed,2);assert.equal(await page.locator('#detail-save-changes').isVisible(),true);await run('desfazer');await page.evaluate(()=>{window.songRepository=window.__repo;});
    assert.deepEqual(errors,[]);console.log('assistant-sequences-ui: OK (icon + simulated speech, real controls/save/undo, manual conflict, event isolation and failure)');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
