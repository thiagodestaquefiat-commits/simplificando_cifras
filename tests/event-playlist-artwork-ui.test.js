const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),shots=path.join(require('node:os').tmpdir(),'roudy-event-spacing');
const types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{const pathname=new URL(req.url,'http://localhost').pathname,file=path.resolve(root,pathname==='/'?'index.html':decodeURIComponent(pathname.slice(1)));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return res.writeHead(404).end();res.writeHead(200,{'Content-Type':(types[path.extname(file)]||'application/octet-stream')+'; charset=utf-8'});fs.createReadStream(file).pipe(res)});
(async()=>{let browser;try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  fs.mkdirSync(shots,{recursive:true});
  browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,serviceWorkers:'block'}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({contentType:'text/css',body:''}));
  await page.route('**/api/**',route=>route.fulfill({status:200,contentType:'application/json',body:'{}'}));
  await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:'domcontentloaded'});
  await page.getByRole('button',{name:'Continuar sem login'}).click();
  await page.evaluate(()=>{
    appCurrentUser={id:'artwork-user',name:'Conta de teste',role:'Liderança'};
    const canvas=document.createElement('canvas');canvas.width=canvas.height=48;const ctx=canvas.getContext('2d');ctx.fillStyle='#336699';ctx.fillRect(0,0,48,48);window.coverFixture=canvas.toDataURL('image/png');
    musicas=[{id:'with-cover',title:'Música com capa',artist:'Artista',artworkUrl:coverFixture,key:'G',blocks:[]},{id:'without-cover',title:'Sem capa',key:'G',blocks:[]}];
    setlists=[eventModel.create({id:'artwork-event',title:'Evento de teste',date:'2099-11-24',leaderId:'artwork-user',members:[{id:'artwork-user',name:'Conta de teste'}],repertoire:[]})];
    userPlaylists.replace('artwork-user',{id:'custom',name:'Capa personalizada',coverImage:coverFixture,items:[{songId:'without-cover'}]});
    userPlaylists.replace('artwork-user',{id:'mosaic',name:'Mosaico',items:[{songId:'with-cover'}]});
    userPlaylists.replace('artwork-user',{id:'empty-cover',name:'Sem imagem',items:[{songId:'without-cover'}]});
    openSD('artwork-event',{refreshChat:false});openEventAddSongs('artwork-event');setEventAddSongsFilter('playlists');
  });
  const custom=page.locator('.event-admin-song-row').filter({hasText:'Capa personalizada'}),mosaic=page.locator('.event-admin-song-row').filter({hasText:'Mosaico'}),fallback=page.locator('.event-admin-song-row').filter({hasText:'Sem imagem'});
  await custom.locator('img').waitFor();await mosaic.locator('img').waitFor();
  assert.equal(await custom.locator('img').getAttribute('src'),await page.evaluate(()=>coverFixture));
  assert.equal(await mosaic.locator('.has-mosaic img').count(),1);
  assert.equal(await fallback.locator('.roudy-artwork-note').getAttribute('viewBox'),'60 36 231 276','nota dupla aprovada para playlist');
  assert.equal(await fallback.locator('.home-playlist-art').textContent(),'','sem fallback com iniciais');
  for(const width of [320,390,820]){
    await page.setViewportSize({width,height:844});
    assert.equal(await page.locator('#event-admin-song-list').evaluate(node=>node.scrollWidth<=node.clientWidth),true);
  }
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:path.join(shots,'event-playlist-artwork.png')});
  await custom.locator('.event-admin-add-button').click();
  await page.waitForFunction(()=>findEvent('artwork-event').repertoire.some(item=>item.songId==='without-cover'));
  assert.deepEqual(errors,[]);
  console.log('event-playlist-artwork-ui.test.js: OK');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve))}})().catch(error=>{console.error(error);process.exitCode=1});
