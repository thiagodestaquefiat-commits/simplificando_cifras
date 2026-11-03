const assert=require('node:assert/strict'),path=require('node:path'),{chromium}=require('playwright');
(async()=>{const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});try{
  const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setContent('<div id="view-detail"><div id="youtube-song-player"></div></div>');
  await page.evaluate(()=>{
    window.YT={Player:function(id,options){let time=50,state=1;window.loopTest={seeks:[],time:value=>time=value,end:()=>{state=0;time=0;}};this.destroy=()=>{};this.getDuration=()=>120;this.getCurrentTime=()=>time;this.getPlayerState=()=>state;this.playVideo=()=>state=1;this.pauseVideo=()=>state=2;this.seekTo=value=>{time=value;loopTest.seeks.push(value)};setTimeout(()=>options.events.onReady({target:this}),0);}};
  });
  await page.addScriptTag({path:path.resolve('js/youtube-player.js')});await page.addScriptTag({path:path.resolve('js/youtube-player-ui.js')});
  await page.evaluate(()=>{const song={id:'loop',title:'Teste',youtubeVideoId:'fixture'};youtubePlayerUI.initialize({getSongs:()=>[song],showToast:()=>{}});youtubePlayerUI.showSong(song);youtubePlayerUI.openExpanded();});
  await page.waitForFunction(()=>youtubePlayer.getDuration()===120);
  await page.getByRole('button',{name:'Repetir trecho',exact:true}).click();
  const panel=page.getByRole('dialog',{name:'Selecionar trecho para repetir'}),sliders=panel.locator('input');
  await sliders.nth(0).evaluate(n=>{n.value=20;n.dispatchEvent(new Event('input'))});await sliders.nth(1).evaluate(n=>{n.value=40;n.dispatchEvent(new Event('input'))});
  await page.getByRole('button',{name:'Ativar repetição do trecho'}).click();
  assert.equal(await page.evaluate(()=>loopTest.seeks.at(-1)),20,'ativação começa no início selecionado');
  for(let i=0;i<5;i++){const before=await page.evaluate(()=>loopTest.seeks.length);await page.evaluate(()=>loopTest.time(41));await page.waitForFunction(n=>loopTest.seeks.length>n,before);assert.equal(await page.evaluate(()=>loopTest.seeks.at(-1)),20);}
  await sliders.nth(0).evaluate(n=>{n.value=25;n.dispatchEvent(new Event('input'))});
  assert.deepEqual(await page.evaluate(()=>youtubePlayer.getSegmentLoop()),{start:25,end:40},'ajuste do intervalo não desliga a repetição');
  await page.getByRole('button',{name:'Fechar seleção'}).click();
  assert.ok(await page.evaluate(()=>youtubePlayer.getSegmentLoop()),'fechar o seletor mantém o loop');
  await page.evaluate(()=>loopTest.end());await page.waitForFunction(()=>loopTest.seeks.at(-1)===25&&youtubePlayer.getCurrentTime()===25);
  await page.getByRole('button',{name:'Repetir trecho',exact:true}).click();
  assert.equal(await page.evaluate(()=>youtubePlayer.getSegmentLoop()),null,'novo clique encerra o loop');
  const count=await page.evaluate(()=>loopTest.seeks.length);await page.evaluate(()=>loopTest.time(50));await page.waitForTimeout(250);assert.equal(await page.evaluate(()=>loopTest.seeks.length),count,'parou de retornar ao início');
  assert.deepEqual(errors,[]);console.log('youtube-repeat-toggle-ui.test.js: OK (5 voltas, ajuste ativo, fechar seletor, fim de vídeo e parar)');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
