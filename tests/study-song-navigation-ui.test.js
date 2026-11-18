const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{for(const width of [375,390,430,820]){
  const page=await browser.newPage({viewport:{width,height:844},hasTouch:true,serviceWorkers:'block'});
  await page.route('**/api/**',r=>r.fulfill({status:200,contentType:'application/json',body:'{}'}));
  await page.goto('http://127.0.0.1:4173/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>typeof openDetail==='function');
  await page.evaluate(()=>{
   continueWithoutLogin();
   musicas=[1,2,3].map(id=>({id,title:'Música '+id,artist:'Artista '+id,key:'C',content:'C G\nLetra de teste',sections:[]}));
   openDetail(1,{playlistContext:{playlistId:'teste',songIds:[1,2,3],currentIndex:0}});
  });
  const prev=page.locator('#btn-previous-song'),next=page.locator('#btn-next-song');
  assert.equal(await prev.isDisabled(),true);
  assert.equal(await page.locator('#study-song-position').textContent(),'1 de 3');
  await next.click();
  assert.equal(await page.locator('#detail-title').textContent(),'Música 2');
  assert.equal(await page.locator('#detail-artist-label').textContent(),'Artista 2');
  const artistBox=await page.locator('#detail-artist-label').boundingBox();
  const positionBox=await page.locator('#study-song-position').boundingBox();
  assert.equal(artistBox.y,positionBox.y,'artist and position share a line');
  assert.equal(await prev.isDisabled(),false);
  const box=await prev.boundingBox();assert.ok(box.width>=44&&box.height>=44);
  await next.click();assert.equal(await next.isDisabled(),true);
  await page.evaluate(()=>navigateSong(1));
  assert.equal(await page.locator('#detail-title').textContent(),'Música 3');
  assert.equal(await page.locator('#study-song-position').textContent(),'3 de 3');
  await prev.click();assert.equal(await page.locator('#detail-title').textContent(),'Música 2');
  await page.evaluate(()=>{document.getElementById('detail-title').textContent='Título muito longo de uma música que não deve sobrepor os controles de navegação';});
  assert.equal(await page.locator('#detail-nav-toolbar').evaluate(e=>e.scrollWidth>e.clientWidth),false);
  if(width===390&&process.env.REVIEW_SCREENSHOT)await page.screenshot({path:process.env.REVIEW_SCREENSHOT});
  await page.evaluate(()=>openDetail(1));
  assert.equal(await prev.isVisible(),false);assert.equal(await next.isVisible(),false);
  assert.equal(await page.locator('#study-song-position').isVisible(),false);
  await page.route('https://www.youtube.com/iframe_api',route=>route.fulfill({
    contentType:'application/javascript',
    body:'window.YT={Player:function(){this.destroy=()=>{}}};window.onYouTubeIframeAPIReady();'
  }));
  await page.evaluate(()=>{
    musicas[1].youtubeVideoId='video-fixture';
    openDetail(2,{playlistContext:{playlistId:'teste',songIds:[1,2,3],currentIndex:1}});
  });
  await page.locator('#view-detail.video-study-expanded').waitFor();
  const videoHeader=page.locator('#view-detail > .detail-header');
  const player=page.locator('#youtube-song-player');
  const initialHeaderBox=await videoHeader.boundingBox();
  assert.ok((await player.boundingBox()).y>=initialHeaderBox.y+initialHeaderBox.height);
  assert.equal(await prev.isVisible(),true);
  assert.equal(await next.isVisible(),true);
  const scrollPastVideo=async()=>{
    await page.evaluate(()=>{
      const detail=document.getElementById('view-detail');
      if(!detail.querySelector('[data-test-scroll-space]')){
        detail.insertAdjacentHTML('beforeend','<div data-test-scroll-space style="flex:0 0 2400px"></div>');
      }
      detail.scrollTop=800;
    });
    assert.equal((await videoHeader.boundingBox()).y,initialHeaderBox.y);
    await prev.waitFor({state:'visible'});
    await next.waitFor({state:'visible'});
  };
  await scrollPastVideo();
  const ordered=()=>page.evaluate(()=>{
    const boxes=['study-back-button','btn-previous-song','study-song-position','btn-next-song','song-assistant-launch']
      .map(id=>document.getElementById(id).getBoundingClientRect());
    return boxes.every((box,index)=>box.width>0&&(!index||boxes[index-1].right<=box.left));
  });
  assert.equal(await ordered(),true,'os controles do vídeo têm áreas distintas');
  await page.locator('#view-detail').evaluate(view=>{view.scrollTop=0});
  await next.click();
  assert.equal(await page.locator('#study-song-position').textContent(),'3 de 3');
  await page.evaluate(()=>{
    closeDetail();
    const playlist=userPlaylists.create(homePlaylists.ownerId,'Navegação por toque',musicas.map(song=>({songId:song.id})));
    homePlaylists.open(playlist.id);
    homePlaylists.openSong(playlist.items[0].id);
  });
  await next.tap();
  assert.equal(await page.locator('#study-song-position').textContent(),'2 de 3');
  await scrollPastVideo();
  await prev.tap();
  assert.equal(await page.locator('#study-song-position').textContent(),'1 de 3');
  await page.evaluate(()=>{
    const detail=document.getElementById('view-detail');
    detail.lastElementChild.insertAdjacentHTML('afterend','<div style="flex:0 0 2400px"></div>');
    detail.scrollTop=800;
  });
  await next.tap();
  assert.equal(await page.locator('#study-song-position').textContent(),'2 de 3');
  assert.equal(await page.locator('#song-control-panel').isHidden(),true);
  await page.close();
 }}finally{await browser.close();}
 console.log('study-song-navigation-ui.test.js: OK (first/middle/last/isolated, 375/390/430/820px)');
})().catch(e=>{console.error(e);process.exitCode=1;});
