const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),shots=path.join(require('node:os').tmpdir(),'roudy-search-review');
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
  await page.evaluate(()=>window.roudySearchMenu.open());
  await page.locator('#roudy-search').waitFor({state:'visible'});
  await page.evaluate(()=>{
    window.originalCoverTestSongs=musicas;
    musicas=['#8833cc','#a38473'].map((color,index)=>{
      const canvas=document.createElement('canvas');
      canvas.width=canvas.height=24;
      const ctx=canvas.getContext('2d');
      ctx.fillStyle=index?'#42464a':'#fff';ctx.fillRect(0,0,24,24);
      ctx.fillStyle=color;ctx.fillRect(0,0,index?3:12,24);
      return {id:`cover-test-${index}`,title:`Capa ${index}`,artworkUrl:canvas.toDataURL()};
    });
    roudySearchMenu.open();
  });
  await page.waitForFunction(()=>document.querySelectorAll('.roudy-search-cover-light.has-color').length===2);
  const colors=await page.locator('.roudy-search-cover-light.has-color').evaluateAll(lights=>
    lights.map(light=>light.style.getPropertyValue('--cover-light').match(/\d+/g).map(Number)));
  assert.ok(colors[0][2]>colors[0][0]&&colors[0][0]>colors[0][1],'a capa roxa mantém o matiz da arte');
  assert.ok(Math.max(...colors[1])-Math.min(...colors[1])<10,'o fundo neutro prevalece sobre uma pequena região quente');
  await page.evaluate(()=>{musicas=window.originalCoverTestSongs;delete window.originalCoverTestSongs;roudySearchMenu.open()});
  await page.waitForTimeout(300);
  assert.equal(await page.locator('.roudy-search-shortcut').count(),4);
  for(const width of [320,375,390,430,1107,1440]){
    await page.setViewportSize({width,height:844});
    const geometry=await page.locator('.roudy-search-explore').evaluate(grid=>({
      horizontalOverflow:grid.scrollWidth>grid.clientWidth,
      contained:[...grid.children].every(card=>{
        const bounds=card.getBoundingClientRect();
        const art=card.querySelector('.roudy-search-shortcut-art').getBoundingClientRect();
        const copy=card.querySelector('.roudy-search-shortcut-copy');
        const text=copy.getBoundingClientRect();
        return art.left>=bounds.left-1&&art.right<=bounds.right+1&&art.top>=bounds.top-1&&art.bottom<=bounds.bottom+1&&
          text.left>=art.left&&text.right<=art.right&&text.top>=art.top&&text.bottom<=art.bottom&&copy.scrollWidth<=copy.clientWidth+1;
      })
    }));
    assert.deepEqual(geometry,{horizontalOverflow:false,contained:true},`atalhos contidos em ${width}px`);
  }
  for(const width of [390, 777]){
    await page.setViewportSize({width,height:844});
    const field=page.locator('.roudy-search-field');
    const appearance=()=>field.evaluate(node=>{
      const {borderRadius,backgroundColor}=getComputedStyle(node);
      return [borderRadius,backgroundColor];
    });
    assert.deepEqual(await appearance(),['6px','rgb(65, 64, 71)']);
    await page.locator('#roudy-search-input').click();
    assert.deepEqual(await appearance(),['999px','rgb(43, 42, 48)']);
    assert.equal(await field.evaluate(node=>getComputedStyle(node).height),'36px');
    assert.equal(await field.locator('.roudy-search-field-icon').isVisible(),false);
    await page.getByRole('button',{name:'Cancelar',exact:true}).click();
    assert.deepEqual(await appearance(),['6px','rgb(65, 64, 71)']);
  }
  await page.setViewportSize({width:390,height:844});
  const scroller=page.locator('.roudy-search-scroll');
  await scroller.evaluate(node=>{node.scrollTop=140});
  await page.waitForFunction(()=>document.querySelector('#roudy-search').classList.contains('is-header-compact'));
  const fade=await page.locator('.roudy-search-form').evaluate(form=>{
    const style=getComputedStyle(form,'::before');
    return {bottom:style.bottom,mask:style.maskImage,gradient:style.backgroundImage};
  });
  assert.equal(fade.bottom,'-72px');
  assert.equal(fade.mask,'none');
  assert.match(fade.gradient,/rgb\(11, 11, 12\)/);
  await scroller.evaluate(node=>{node.scrollTop=0});
  await page.waitForFunction(()=>!document.querySelector('#roudy-search').classList.contains('is-header-compact'));
  const mobileCards=await page.locator('.roudy-search-shortcut').evaluateAll(cards=>cards.map(card=>{
    const {x,y,width,height}=card.querySelector('.roudy-search-shortcut-art').getBoundingClientRect();
    return {label:card.getAttribute('aria-label'),x,y,width,height};
  }));
  assert.deepEqual(mobileCards.map(card=>card.label),['Explorar músicas','Abrir playlists','Abrir Medley','Abrir eventos']);
  assert.equal(mobileCards[0].y,mobileCards[1].y);
  assert.equal(mobileCards[2].y,mobileCards[3].y);
  assert.ok(mobileCards[0].y<mobileCards[2].y);
  assert.ok(mobileCards.every(card=>card.width===mobileCards[0].width&&card.height===mobileCards[0].height));
  for(const element of ['strong','small span']){
    const typography=await page.locator('.roudy-search-shortcut-copy '+element).evaluateAll(nodes=>nodes.map(node=>{
      const {fontFamily,fontSize,fontWeight,lineHeight,letterSpacing}=getComputedStyle(node);
      return {fontFamily,fontSize,fontWeight,lineHeight,letterSpacing};
    }));
    assert.equal(typography.length,4);
    for(const [index,style] of typography.entries()){
      const expectedWeight=element==='small span'&&index===1?'700':typography[0].fontWeight;
      assert.deepEqual(style,{...typography[0],fontWeight:expectedWeight});
    }
  }
  assert.equal(await page.getByText('Explorar no ROUDY',{exact:true}).count(),1);
  // Search is a primary screen, not a modal: tools opened from its profile
  // must cover the whole screen instead of leaking only below search.
  await page.evaluate(()=>openTuner());
  assert.equal(await page.locator('#tuner-instrument').evaluate(node=>{
    const r=node.getBoundingClientRect();return document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)?.closest('#modal-overlay')!==null;
  }),true,'afinador recebe os toques acima da tela Buscar');
  await page.screenshot({path:path.join(shots,'roudy-buscar-afinador-camadas.png'),fullPage:false});
  await page.evaluate(()=>closeModal());
  for(const height of [640,760,844]){
    await page.setViewportSize({width:390,height});
    assert.equal(await page.locator('#tab-search').evaluate(node=>{
      const r=node.getBoundingClientRect();return document.elementFromPoint(r.left+r.width/2,r.top+12)?.closest('#tab-search')!==null;
    }),true,'navegação continua acessível com a mudança de altura do navegador');
  }
  await page.evaluate(()=>{
    window.originalCardData={musicas,setlists,appCurrentUser};
    appCurrentUser={...appCurrentUser,id:"card-test-owner"};
    musicas=[{artist:'Banda'},{artist:'Medley'}];
    setlists=[{date:'2000-01-01',time:'10:00'},{date:'2099-11-24',time:'19:30'},{date:'2099-11-25',time:'08:00'}];
    userPlaylists.replace(homePlaylists.ownerId,{id:'card-owned',name:'Ensaio',items:[]});
    userPlaylists.replace(homePlaylists.ownerId,{id:'card-received',name:'Recebida',items:[],sharedFrom:'shared-id'});
    roudySearchMenu.refreshCards();
  });
  const cardDetails=()=>page.locator('.roudy-search-shortcut-copy small span').allTextContents();
  assert.deepEqual(await cardDetails(),['2 músicas','1 playlist','1 medley','Próximo: 24 nov. · 19h30']);
  await page.screenshot({path:path.join(shots,'roudy-explorar-cards.png'),fullPage:false});
  await page.evaluate(()=>{
    musicas=[];setlists=[];
    userPlaylists.remove(homePlaylists.ownerId,"card-owned");
    userPlaylists.remove(homePlaylists.ownerId,"card-received");
    roudySearchMenu.refreshCards();
  });
  assert.deepEqual(await cardDetails(),['0 músicas','0 playlists','0 medleys','Nenhum próximo evento']);
  await page.evaluate(()=>{
    const original=window.originalCardData;
    musicas=original.musicas;setlists=original.setlists;
    appCurrentUser=original.appCurrentUser;
    delete window.originalCardData;
    roudySearchMenu.refreshCards();
  });
  await page.screenshot({path:path.join(shots,'roudy-buscar-mobile-inicial.png'),fullPage:false});
  const songCount=await page.evaluate(()=>musicas.length);
  await page.getByRole('button',{name:'Explorar músicas',exact:true}).click();
  assert.equal(await page.locator('.roudy-search-song-row').count(),songCount,'Todas sem consulta mostra a biblioteca da conta');
  assert.equal(await page.locator('[data-playlist-online-results]').count(),0,'não carrega catálogo externo sem consulta');
  await page.evaluate(()=>{window.searchTestSongs=musicas;musicas=Array.from({length:107},(_,index)=>({id:'account-test-'+index,title:'Canção '+String(index+1).padStart(3,'0'),artist:'Artista de teste',key:'G'}));roudySearchMenu.setFilter('all');});
  assert.equal(await page.locator('.roudy-search-song-row').count(),107,'a listagem inicial não deve parar em 30 músicas');
  await page.locator('#roudy-search-input').fill('107');await page.waitForTimeout(180);
  assert.equal(await page.locator('.roudy-search-song-row').count(),1,'digitação continua filtrando a biblioteca');
  await page.locator('#roudy-search-input').fill('');await page.waitForTimeout(180);
  assert.equal(await page.locator('.roudy-search-song-row').count(),107,'limpar a consulta restaura Todas');
  await page.evaluate(()=>{musicas=[];roudySearchMenu.setFilter('all');});
  assert.equal(await page.locator('.roudy-search-song-row').count(),0);
  assert.equal(await page.getByText('Busque uma música ou artista.',{exact:true}).count(),1,'conta sem músicas não mostra biblioteca anterior');
  await page.evaluate(()=>{musicas=window.searchTestSongs;delete window.searchTestSongs;roudySearchMenu.setFilter('all');});
  await page.screenshot({path:path.join(shots,'roudy-buscar-todas-conta.png'),fullPage:false});
  const input=page.locator('#roudy-search-input');await input.fill('Ah, Jesus');await page.waitForTimeout(180);
  assert.ok(await page.locator('.roudy-search-song-row').count()>0,'busca local deve apresentar música real');
  assert.equal(await page.locator('[data-playlist-online-results]').count(),0,'resultados não criam uma segunda lista técnica');
  const firstResult=page.locator('.roudy-search-song-row').first();
  await firstResult.locator('.roudy-search-local-more').click();
  assert.equal(await page.getByText('Adicionar ao repertório',{exact:true}).count()>0,true,'três pontos mantêm as ações existentes');
  await page.evaluate(()=>closeSongOptions());
  await page.screenshot({path:path.join(shots,'roudy-buscar-mobile-resultados.png'),fullPage:false});
  await firstResult.locator('.roudy-search-song-open').click();await page.waitForTimeout(260);
  assert.ok(await page.locator('#view-detail').evaluate(node=>node.classList.contains('open')||getComputedStyle(node).display!=='none'),'resultado abre o Estudo');
  await page.evaluate(()=>closeDetail());
  for(const [label,tab] of [['Abrir playlists','musicas'],['Abrir Medley','medley'],['Abrir eventos','setlists']]){
    await page.evaluate(()=>openPrimarySearchTab());
    await page.getByRole('button',{name:label,exact:true}).click();
    await page.waitForFunction(expected=>currentTab===expected,tab);
  }
  assert.deepEqual(errors,[]);
  console.log('search-menu-ui.test.js: OK');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve))}})().catch(error=>{console.error(error);process.exitCode=1});
