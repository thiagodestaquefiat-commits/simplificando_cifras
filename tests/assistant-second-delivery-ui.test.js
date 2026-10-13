const assert = require('node:assert/strict');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  try {
    const context=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844}});
    const page=await context.newPage(), errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/api/**',route=>route.fulfill({json:{enabled:false,songs:[],events:[],bands:[]}}));
    await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({body:'',contentType:'text/css'}));
    await page.goto('http://127.0.0.1:4173/?assistant-phase2-test=1');
    await page.waitForFunction(()=>loginGateAuthReady&&window.roudyAssistant);
    await page.evaluate(()=>{
      continueWithoutLogin();
      musicas.push(songModel.create({id:'phase2',title:'A Alegria de Testar',artist:'Autor',key:'G',blocos:[{l:'Verso',c:'G C D'}],fullChordSheet:{source:'user_text',content:'G C D\nLetra original'}}));
      commitSongs(musicas);openDetail('phase2');
    });
    const run=text=>page.evaluate(text=>roudyAssistant.run(text),text);
    const succeeds=async(text,id)=>{const output=await run(text);assert.equal(output.ok,true,`${text}: ${JSON.stringify(output)}`);if(id)assert.equal(output.action,id);return output;};
    const blocked=async text=>{const output=await run(text);assert.equal(output.ok,false,`${text}: ${JSON.stringify(output)}`);return output;};
    for(const [name,code] of Object.entries({portugues:'pt-BR',ingles:'en',espanhol:'es',italiano:'it',frances:'fr',alemao:'de'})){
      await succeeds(`mudar idioma para ${name}`,'settings.language');assert.equal(await page.evaluate(()=>document.documentElement.lang),code);
    }
    await succeeds('mudar idioma para português');
    for(const [name,code] of Object.entries({dourado:'gold',azul:'blue',verde:'green',coral:'coral'})){
      await succeeds(`mudar cor da cifra para ${name}`,'settings.color');assert.equal(await page.evaluate(()=>loadAppSettings().chordColor),code);
    }
    await succeeds('ligar alto contraste','settings.accessibility');assert.equal(await page.evaluate(()=>loadAppSettings().highContrast),true);
    await succeeds('desligar alto contraste');await succeeds('ativar modo para daltônicos');await succeeds('desativar modo daltônico');
    await succeeds('escala da interface 120 por cento','settings.scale');await succeeds('tema claro','settings.theme');await succeeds('tema do sistema');await succeeds('tema escuro');
    await page.evaluate(()=>{window.__originalStorage=storage;window.storage=Object.freeze({...storage,set:()=>false});});
    await blocked('cor da cifra azul');assert.equal(await page.evaluate(()=>loadAppSettings().chordColor),'coral');
    await page.evaluate(()=>{window.storage=window.__originalStorage;});
    await succeeds('abrir aparência');await succeeds('cor da cifra azul');assert.equal(await page.locator('#setting-chord-color').inputValue(),'blue');
    await page.locator('#setting-theme').selectOption('light');await blocked('abrir playlist');assert.equal(await page.locator('#setting-theme').inputValue(),'light','voice must preserve an unsaved settings preview');await page.evaluate(()=>{closeModal();applyAppSettings();});
    await succeeds('instrumento para ukulele','song.instrument');assert.equal(await page.evaluate(()=>currentInstrument),'ukulele');
    await blocked('ver tablatura');await succeeds('ver letra','song.view');assert.equal(await page.evaluate(()=>currentSongPage),2);
    await succeeds('ver letra e cifra');await succeeds('ver resumo harmônico');assert.equal(await page.evaluate(()=>currentSongPage),0);
    await succeeds('aumentar velocidade da rolagem','scroll.speed');assert.equal(await page.evaluate(()=>scrollSpeed),33);
    await succeeds('ativar modo palco','stage.play');await succeeds('aumentar fonte','song.font');assert.equal(await page.evaluate(()=>detailStageFont),30);
    await succeeds('salvar alterações','song.save');await succeeds('sair do modo palco','stage.play');
    await page.evaluate(()=>{closeDetail();openDetail('phase2');});assert.equal(await page.evaluate(()=>detailStageFont),30);assert.equal(await page.evaluate(()=>currentInstrument),'ukulele');
    for(const [text,selector] of [['abrir configurações','button[onclick="openLanguageSettings()"]'],['abrir aparência e acessibilidade','#setting-theme'],['abrir idioma','.language-grid'],['abrir ferramentas','.tuner-menu-icon'],['abrir ajuda','button[onclick*="openLibrarySync"]'],['abrir bandas','#new-band-name'],['abrir notificações','#roudy-notification-items'],['abrir backup','[data-library-sync-status]']]){
      await succeeds(text,'navigation.panel');assert.equal(await page.locator(selector).first().isVisible(),true,text);await page.evaluate(()=>closeModal());
    }
    await succeeds('afinador para ukulele','tuner.open');await succeeds('corda quatro','tuner.string');assert.equal(await page.evaluate(()=>tunerSelectedIndex),3);
    await blocked('corda cinco');await succeeds('afinador automático');assert.equal(await page.evaluate(()=>tunerSelectedIndex),null);await page.evaluate(()=>closeModal());
    await succeeds('abrir meu perfil','navigation.panel');assert.equal(await page.locator('#profile-name').isVisible(),true);assert.equal(await page.locator('#song-assistant-launch').isVisible(),false,'profile keeps the assistant hidden');await page.evaluate(()=>closeModal());
    for(const [text,selector,close] of [['gerar com IA','#ai-summary-overlay',()=>aiHarmonicSummary.close()],['adicionar por arquivo','[data-ai-form=arquivo]',()=>aiHarmonicSummary.close()],['adicionar por texto','[data-ai-form=texto]',()=>aiHarmonicSummary.close()],['busca por IA','#playlist-ai-search-mode',()=>document.querySelector('.playlist-ai-search-back').click()]]){
      await succeeds(text,'music.generate');assert.equal(await page.locator(selector).isVisible(),true,text);assert.equal((await run('tema claro')).status,'blocked',text==='busca por IA'?'search form is an editor too':'preserve generation form');await page.evaluate(close);
    }
    await page.evaluate(()=>openDetail('phase2'));await succeeds('editar esta música','song.edit');assert.equal(await page.locator('#ai-review-title').isVisible(),true);
    await blocked('abrir playlist');await page.evaluate(()=>closeModal());
    let confirmations=0;page.on('dialog',async dialog=>{confirmations++;await dialog.dismiss();});
    assert.equal((await run('excluir música')).awaitingResponse,true);await succeeds('sim','song.delete');assert.equal(confirmations,1);assert.equal(await page.evaluate(()=>musicas.some(song=>song.id==='phase2')),true,'cancelled native confirmation preserves music');
    await succeeds('novo evento','event.create');assert.equal(await page.locator('#fs-title').isVisible(),true);await blocked('tema claro');await page.evaluate(()=>closeModal());
    await page.evaluate(()=>{
      closeDetail();const source=musicas.find(song=>song.id==='phase2');
      setlists.push(eventModel.create({id:'phase2-event',title:'Ensaio de teste',date:'2030-10-10',leaderId:appCurrentUser.id,members:[{...appCurrentUser,isLeader:true},{id:'other',name:'Outro',role:'Guitarra'}],repertoire:[{id:'p2-item',songId:source.id,shared:eventEditFromSong(eventSongCopy(source))}]}));
      openSD('phase2-event');
    });
    for(const [text,selector] of [['editar evento','#event-admin-date'],['adicionar música ao evento','#event-admin-song-list'],['ordenar repertório','#event-admin-order-list'],['transferir liderança','#event-next-leader'],['notificações do evento','.notification-center-page'],['ver participantes','.event-participants-section'],['excluir evento','#event-action-layer']]){
      await succeeds(text,'event.workflow');assert.equal(await page.locator(selector).isVisible(),true,text);
      await page.evaluate(()=>{closeModal();closeEventAdminSheet();closeEventActionLayer();});
    }
    assert.equal(await page.evaluate(()=>Boolean(findEvent('phase2-event'))),true,'voice opens delete menu but never directly deletes events');
    await page.evaluate(()=>{findEvent('phase2-event').leaderId='other';});
    await blocked('editar evento');await blocked('excluir evento');
    await page.evaluate(()=>{findEvent('phase2-event').leaderId=appCurrentUser.id;});
    await blocked('convidar integrante');await succeeds('abrir chat do evento');assert.equal(await page.locator('#event-chat-view').isVisible(),true);await succeeds('voltar');
    await page.evaluate(()=>{
      window.__authFacade=appAuth;window.__songsFacade=songRepository;
      window.appAuth=Object.freeze({...appAuth,getState:()=>({authenticated:true,user:{id:appCurrentUser.id}})});
      window.songRepository=Object.freeze({...songRepository,getActiveOwnerId:()=>appCurrentUser.id});
    });
    await succeeds('convidar integrante','event.workflow');assert.equal(await page.locator('#event-people-search-input').isVisible(),true);
    await page.evaluate(()=>{eventUserInvites.closeSearchSheet();window.appAuth=window.__authFacade;window.songRepository=window.__songsFacade;});
    await page.evaluate(()=>{closeSD();openDetail('phase2');currentSdId='phase2-event';});
    await blocked('editar evento');await blocked('excluir música e mudar idioma para inglês');await blocked('não mudar a cor da cifra');
    await page.evaluate(()=>{closeDetail();openDetailFromEventItem('phase2-event','p2-item');});
    await blocked('excluir música');await succeeds('editar evento');assert.equal(await page.locator('#view-detail').isVisible(),false,'event workflow must not remain behind an opened song');await page.evaluate(()=>closeEventAdminSheet());
    await succeeds('adicionar bloco','medley.workflow');assert.equal(await page.locator('#med-music').isVisible(),true);await blocked('mudar idioma para inglês');await page.evaluate(()=>closeModal());
    await blocked('sincronizar agora');
    const downloadPromise=page.waitForEvent('download');await succeeds('exportar backup do perfil','backup.workflow');assert.ok((await downloadPromise).suggestedFilename().endsWith('.json'));
    await succeeds('importar backup de perfil','backup.workflow');await page.locator('#modal-body details').evaluateAll(nodes=>nodes.forEach(node=>{node.open=true;}));const pickerPromise=page.waitForEvent('filechooser');await page.locator('button[onclick="selectLibraryBackup()"]').click();await pickerPromise;
    await page.evaluate(()=>{
      closeModal();closeDetail();closeSD();switchTab('musicas');
      window.SpeechRecognition=class {start(){this.onstart?.();setTimeout(()=>this.onresult?.({results:[[{transcript:'mude o idioma para francês'}]]}),0);}stop(){}};
      roudyAssistant.updateLaunchVisibility();
    });
    await page.locator('#app-assistant-launch').click();await page.waitForFunction(()=>document.documentElement.lang==='fr');
    assert.equal(await page.evaluate(()=>roudyAssistant.getLastActionResult().action),'settings.language','icon/transcript uses the same verified action manager');
    assert.deepEqual(errors,[]);console.log('assistant-second-delivery-ui: OK (settings, tools, persisted study, native panels, generation, editor protection, events, confirmations and backup)');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
