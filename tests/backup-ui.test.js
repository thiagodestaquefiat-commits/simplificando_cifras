const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const file=path.resolve(root,pathname==='/'?'index.html':pathname.slice(1));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}
  const types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json'};
  res.writeHead(200,{'Content-Type':`${types[path.extname(file)]||'application/octet-stream'}; charset=utf-8`});fs.createReadStream(file).pipe(res);
});
(async()=>{
  let browser;
  try{
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const executablePath=['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].find(fs.existsSync);
    browser=await chromium.launch({headless:true,executablePath});
    const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
    await context.route('**/api/auth/config',route=>route.fulfill({json:{enabled:false,provider:'local'}}));
    await context.route('https://fonts.googleapis.com/**',route=>route.fulfill({contentType:'text/css',body:''}));
    const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:'domcontentloaded'});
    await page.getByText('Continuar sem login',{exact:true}).click();
    await page.evaluate(()=>openLibrarySync());
    await page.locator('.sync-advanced summary').click();
    assert.equal(await page.getByText('Exportar meus dados',{exact:true}).isVisible(),true);
    assert.equal(await page.getByText('Recuperar versões',{exact:true}).isVisible(),true);
    const fixture=await page.evaluate(()=>{
      const original=songModel.create({id:'backup-ui-original',title:'Teste <img src=x onerror=alert(1)>',key:'D',blocos:[{c:'D A'}]});
      commitSongs([...musicas,original]);
      return libraryExporter.buildExport({ownerId:'guest',musicas:[{...original,key:'C'},songModel.create({id:'backup-ui-new',title:'Nova do backup',key:'G',blocos:[{c:'G D'}]})],events:[{id:'old-event'}],medleys:[],configuracoes:{theme:'dark'}});
    });
    await page.getByText('Restaurar backup',{exact:true}).click();
    await page.locator('body > input[type="file"]').setInputFiles({name:'backup-seguro.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture))});
    await page.locator('[data-restore-song]').waitFor();
    assert.equal(await page.locator('#modal-body img').count(),0,'títulos do backup não executam HTML');
    assert.match(await page.locator('#modal-body').innerText(),/Somente músicas serão restauradas/);
    await page.locator('[data-restore-song]').uncheck();
    await page.locator('[data-restore-conflict]').check();
    await page.getByText('Restaurar músicas selecionadas',{exact:true}).click();
    const after=await page.evaluate(()=>musicas.filter(song=>String(song.id).startsWith('backup-ui')||song.title.includes('cópia recuperada')).map(song=>({id:song.id,key:song.key,title:song.title})));
    assert.equal(after.find(song=>song.id==='backup-ui-original').key,'D');
    assert.equal(after.some(song=>song.id==='backup-ui-new'),false);
    assert.equal(after.some(song=>song.key==='C'&&song.title.includes('cópia recuperada')),true);

    await page.evaluate(()=>{const old=musicas.find(song=>song.id==='backup-ui-original');commitSongs(musicas.map(song=>song.id===old.id?{...song,key:'E'}:song));openLibraryRecovery();});
    await page.getByText('Recuperar como cópia',{exact:true}).first().click();
    assert.equal(await page.evaluate(()=>musicas.some(song=>song.key==='D'&&song.title.includes('cópia recuperada'))),true);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'interface sem transbordamento no celular');

    // A simulated quota failure must leave the editor open, without success or mutation.
    await page.evaluate(()=>{
      closeModal();openAddMusica();
      const original=Storage.prototype.setItem;
      window.restoreStorage=()=>{Storage.prototype.setItem=original;};
      Storage.prototype.setItem=function(key,value){if(key==='sc_songs_v1')throw new DOMException('quota','QuotaExceededError');return original.call(this,key,value);};
    });
    await page.locator('#fm-title').fill('Não pode confirmar salvamento');await page.locator('#fm-blocos').fill('C G');
    await page.getByText('Adicionar',{exact:true}).click();
    assert.equal(await page.locator('#fm-title').isVisible(),true);
    assert.match(await page.locator('#toast').innerText(),/Não foi possível salvar/);
    assert.equal(await page.evaluate(()=>musicas.some(song=>song.title==='Não pode confirmar salvamento')),false);
    await page.evaluate(()=>restoreStorage());
    await page.setViewportSize({width:1440,height:1000});
    await page.evaluate(()=>{closeModal();openLibraryRecovery();});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'interface sem transbordamento no desktop');
    const downloadPromise=page.waitForEvent('download');
    await page.evaluate(()=>{closeModal();exportarBiblioteca({quiet:true});});
    const download=await downloadPromise;assert.match(download.suggestedFilename(),/^roudy-biblioteca-.*\.json$/);
    const content=JSON.parse(fs.readFileSync(await download.path(),'utf8'));
    assert.equal(content.versao,2);assert.equal(content.escopo.tipo,'visitante');assert.equal(content.origens.armazenamentoUsuario,undefined);
    assert.deepEqual(errors,[]);
    console.log('backup-ui.test.js: OK (celular/desktop, download, seleção, cópia, recuperação, XSS e quota)');
  }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
