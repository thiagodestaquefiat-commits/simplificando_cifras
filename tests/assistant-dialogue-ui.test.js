const assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  try{
    const context=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844}}),page=await context.newPage(),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/api/**',route=>route.fulfill({json:{enabled:false,songs:[],events:[],bands:[]}}));
    await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({body:'',contentType:'text/css'}));
    await page.goto('http://127.0.0.1:4173/?assistant-dialogue-test=1');await page.waitForFunction(()=>loginGateAuthReady&&window.roudyAssistant);
    await page.evaluate(()=>{
      continueWithoutLogin();musicas.push(songModel.create({id:'dialogue-song',title:'Canção de acompanhamento',artist:'Autor',key:'G',blocos:[{l:'Verso',c:'G C D'}]}));commitSongs(musicas);openDetail('dialogue-song');
      window.__captures=[];window.__utterances=[];window.__throwStart=false;
      window.SpeechRecognition=class{
        start(){window.__captures.push(this);if(window.__throwStart)throw new Error('requires gesture');this.active=true;this.onstart?.();}
        stop(){this.active=false;this.onend?.();}
        emit(text){this.onresult?.({results:[[{transcript:text}]]});}
      };
      window.SpeechSynthesisUtterance=class{constructor(text){this.text=text;}};
      Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{cancel(){},speak(utterance){window.__utterances.push(utterance);}}});
    });
    const run=(text,options)=>page.evaluate(({text,options})=>roudyAssistant.run(text,options),{text,options});
    const click=()=>page.locator('#song-assistant-launch').click();
    const emit=text=>page.evaluate(text=>window.__captures.at(-1).emit(text),text);
    const finish=()=>page.evaluate(()=>window.__utterances.at(-1).onend?.());
    const count=()=>page.evaluate(()=>window.__captures.length);
    const waitQuestion=()=>page.waitForFunction(()=>Boolean(roudyAssistant.getConversationState()));
    const waitCapture=n=>page.waitForFunction(n=>window.__captures.length===n&&window.__captures.at(-1).active,n);
    await click();await emit('mude a cor da cifra para azul');await page.waitForFunction(()=>loadAppSettings().chordColor==='blue');
    assert.equal(await page.evaluate(()=>roudyAssistant.getConversationState()),null);await finish();assert.equal(await count(),1,'direct command never reopens microphone');
    await click();await emit('mude a cor da cifra');await waitQuestion();const before=await count();
    assert.equal(await page.evaluate(()=>loadAppSettings().chordColor),'blue');
    await page.waitForTimeout(250);assert.equal(await count(),before,'must not listen before TTS finishes');
    await finish();await waitCapture(before+1);await emit('verde');await page.waitForFunction(()=>loadAppSettings().chordColor==='green');
    assert.equal(await page.evaluate(()=>roudyAssistant.getConversationState()),null);await finish();assert.equal(await count(),before+1,'one follow-up, not continuous listening');
    await click();await emit('mudar idioma');await waitQuestion();
    await page.evaluate(()=>{window.__throwStart=true;});const denied=await count()+1;await finish();await page.waitForFunction(n=>window.__captures.length===n,denied);
    assert.equal(await page.evaluate(()=>window.__captures.at(-1).active||false),false);assert.ok(await page.evaluate(()=>roudyAssistant.getConversationState()),'failed automatic resume keeps the question');
    await page.waitForTimeout(350);assert.equal(await count(),denied,'no endless restart loop after failure');
    await page.evaluate(()=>{window.__throwStart=false;});await click();await emit('inglês');await page.waitForFunction(()=>document.documentElement.lang==='en');assert.equal(await page.evaluate(()=>roudyAssistant.getConversationState()),null);
    await run('mudar idioma para português');
    await page.evaluate(()=>{
      const date=new Date(),today=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
      setlists.push(...[{id:'dialogue-ensaio',title:'Ensaio',time:'15:00'},{id:'dialogue-culto',title:'Culto',time:'19:00'}].map(item=>eventModel.create({...item,date:today,leaderId:appCurrentUser.id,members:[{...appCurrentUser,isLeader:true}]})));
    });
    await click();await emit('abra o evento de hoje');await waitQuestion();
    assert.equal(await page.locator('#view-detail').isVisible(),true,'question does not navigate behind the song');assert.equal(await page.locator('#view-sd').isVisible(),false);
    const eventsCapture=await count();await finish();await waitCapture(eventsCapture+1);await emit('o culto');await page.waitForFunction(()=>currentSdId==='dialogue-culto'&&document.getElementById('view-detail').style.display==='none');
    assert.equal(await page.locator('#view-sd').isVisible(),true);assert.equal(await page.evaluate(()=>roudyAssistant.getConversationState()),null);
    await page.evaluate(()=>{closeSD();openDetail('dialogue-song');});
    await click();await emit('mudar cor');await waitQuestion();const cancelled=await count();await finish();await waitCapture(cancelled+1);await emit('cancelar');await page.waitForFunction(()=>roudyAssistant.getConversationState()===null);assert.equal(await page.evaluate(()=>loadAppSettings().chordColor),'green');
    await run('mudar cor');assert.equal((await run('bpm 96')).ok,true);assert.equal(await page.evaluate(()=>roudyAssistant.getConversationState()),null,'new full request cancels pending question');assert.equal(await page.evaluate(()=>studyMetronome.getBpm()),96);
    await click();await emit('mudar cor');await waitQuestion();const profileCapture=await count();
    await page.evaluate(()=>openProfileSettings());assert.equal(await page.evaluate(()=>roudyAssistant.getConversationState()),null);await finish();await page.waitForTimeout(250);assert.equal(await count(),profileCapture,'opening profile invalidates pending TTS callback');
    assert.equal(await page.locator('#song-assistant-launch').isVisible(),false);await page.evaluate(()=>closeModal());
    await run('mudar cor');await page.evaluate(()=>{
      window.__originalNow=Date.now;const instant=Date.now()+31000;Date.now=()=>instant;
    });assert.equal(await page.evaluate(()=>roudyAssistant.getConversationState()),null);assert.equal((await run('azul')).status,'blocked');await page.evaluate(()=>{Date.now=window.__originalNow;});
    const question=await run('excluir música');assert.equal(question.awaitingResponse,true);assert.equal(await page.evaluate(()=>musicas.some(song=>song.id==='dialogue-song')),true);
    await run('não');assert.equal(await page.evaluate(()=>musicas.some(song=>song.id==='dialogue-song')),true);assert.equal((await run('sim')).ok,false,'stray confirmation has no action');
    await page.evaluate(()=>{
      closeDetail();setlists.push(eventModel.create({id:'dialogue-invite',title:'Convite de teste',date:'2030-10-10',leaderId:appCurrentUser.id,members:[{...appCurrentUser,isLeader:true}]}));openSD('dialogue-invite');
      window.__authFacade=appAuth;window.__songsFacade=songRepository;window.__collaborationFacade=eventCollaboration;window.__confirmFacade=appConfirm;
      window.appAuth=Object.freeze({...appAuth,getState:()=>({authenticated:true,user:{id:appCurrentUser.id}})});window.songRepository=Object.freeze({...songRepository,getActiveOwnerId:()=>appCurrentUser.id});
      window.__inviteCandidates=[{id:'user-silva',name:'João Silva',username:'joao_silva'},{id:'user-santos',name:'João Santos',username:'joao_santos'}];window.__inviteCalls=[];window.__nativeConfirmations=0;window.__allowNative=false;
      window.eventCollaboration=Object.freeze({...eventCollaboration,searchUsers:async()=>({users:window.__inviteCandidates,nextOffset:null}),inviteUser:async(...args)=>{window.__inviteCalls.push(args);return {id:'invitation-test'};}});
      window.appConfirm=()=>{window.__nativeConfirmations++;return window.__allowNative;};
    });
    assert.equal((await run('convida João')).awaitingResponse,true);assert.equal((await run('João Silva')).awaitingResponse,true);assert.equal(await page.evaluate(()=>window.__inviteCalls.length),0);
    assert.equal((await run('sim')).status,'noop');assert.equal(await page.evaluate(()=>window.__nativeConfirmations),1);assert.equal(await page.evaluate(()=>window.__inviteCalls.length),0,'native cancellation stops the external write');
    await page.evaluate(()=>{eventUserInvites.closeSearchSheet();window.__allowNative=true;});
    await run('convidar João');await run('o segundo');const invitation=await run('sim',{requestId:'one-invitation'});assert.equal(invitation.ok,true,JSON.stringify(invitation));assert.equal((await run('sim',{requestId:'one-invitation'})).duplicate,true);
    assert.deepEqual(await page.evaluate(()=>window.__inviteCalls),[['dialogue-invite','user-santos','Outra']],'only selected account receives exactly one invitation');
    await page.evaluate(()=>{eventUserInvites.closeSearchSheet();window.appAuth=window.__authFacade;window.songRepository=window.__songsFacade;window.eventCollaboration=window.__collaborationFacade;window.appConfirm=window.__confirmFacade;closeSD();openDetail('dialogue-song');});
    await run('mudar cor');await page.evaluate(()=>{appCurrentUser=Object.freeze({...appCurrentUser,id:'new-account'});});assert.equal(await page.evaluate(()=>roudyAssistant.getConversationState()),null);assert.equal((await run('branco')).status,'blocked');
    assert.equal(await page.evaluate(()=>loadAppSettings().chordColor),'green');assert.deepEqual(errors,[]);
    console.log('assistant-dialogue-ui: OK (icon, direct commands, TTS barrier, one-shot follow-up, gesture fallback, event choice, cancel, screens/account and expiry)');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
