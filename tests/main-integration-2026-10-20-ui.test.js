const assert=require('node:assert/strict'),{chromium}=require(process.env.ROUDY_TEST_PLAYWRIGHT||'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.ROUDY_CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{
  for(const width of [390,1366]){
   const page=await browser.newPage({viewport:{width,height:900},serviceWorkers:'block'}),errors=[];
   page.on('pageerror',error=>errors.push(error.message));
   await page.route('**/api/**',route=>route.fulfill({json:{enabled:false,songs:[],events:[],bands:[]}}));
   await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({body:'',contentType:'text/css'}));
   await page.goto('http://127.0.0.1:4173/?main-integrada-teste=516');
   await page.waitForFunction(()=>loginGateAuthReady);
   await page.evaluate(()=>{
    continueWithoutLogin();
    musicas=[{id:'integration-song',title:'Canção de integração',artist:'Equipe',key:'C',blocos:[{l:'Verso',c:'C F G\nLetra original'}]}];
    const playlist=userPlaylists.create(appCurrentUser.id,'Playlist de integração');
    userPlaylists.addSong(appCurrentUser.id,playlist.id,musicas[0].id,{semitones:2});
    window.__integrationPlaylist=playlist.id;homePlaylists.back();
   });
   await page.getByRole('button',{name:/Playlist de integração/}).click();
   await page.getByRole('button',{name:'Ajustar tons das músicas',exact:true}).click();
   const keyOutput=page.locator('.home-playlist-key-stepper output');
   assert.equal((await keyOutput.textContent()).trim(),'D');
   await page.getByRole('button',{name:'Aumentar tom de Canção de integração',exact:true}).click();
   const playlistKey=(await keyOutput.textContent()).trim();
   assert.notEqual(playlistKey,'D');
   const copied=await page.evaluate(()=>{
    const event=eventModel.create({id:'integration-event',title:'Evento',date:'2099-01-01',leaderId:appCurrentUser.id,members:[{...appCurrentUser,role:'Liderança',isLeader:true}],repertoire:[]});
    setlists.push(event);
    const updated=homePlaylists.addPlaylistToEvent(window.__integrationPlaylist,event.id),shared=updated.repertoire[0].shared;
    return {key:shared.key,source:shared.chordSheetKey,libraryKey:musicas[0].key,text:songFormat.simpleText(eventSongModel(musicas[0],shared))};
   });
   assert.equal(copied.key,playlistKey);assert.equal(copied.source,playlistKey);
   assert.equal(copied.libraryKey,'C','playlist e evento não alteram o original');
   assert.ok(copied.text.includes(playlistKey));
   await page.evaluate(()=>homePlaylists.openSong(userPlaylists.get(appCurrentUser.id,window.__integrationPlaylist).items[0].id));
   const block=page.locator('[data-long-press-edit]:visible').first();
   await block.waitFor({state:'visible'});
   await block.evaluate(node=>beginInlineBlockEdit(node));
   const input=block.locator('textarea').last();
   await input.fill('C F G');await input.press('End');await input.press('Space');await input.press('Enter');await input.pressSequentially('Linha nova');
   assert.match(await input.inputValue(),/C F G \nLinha nova$/,'espaço/enter não são interceptados pelo bloco');
   await page.evaluate(()=>cancelInlineBlockEdit());
   assert.deepEqual(errors,[]);await page.close();
  }
  console.log('main-integration-ui: OK (Home, tons por playlist, cópia para evento e teclado em celular/desktop)');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
