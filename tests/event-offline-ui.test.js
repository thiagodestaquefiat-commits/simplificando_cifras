const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{const file=path.resolve(root,new URL(req.url,'http://localhost').pathname.slice(1)||'index.html');if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return res.writeHead(404).end();res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'application/javascript','.css':'text/css','.webmanifest':'application/manifest+json','.png':'image/png'})[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);});
const song={id:'offline-song',title:'Canção Offline',artist:'Teste',key:'C',blocos:[{l:'Gancho',c:'C G\nGancho de teste'}],fullChordSheet:{content:'C        G\nLetra completa de teste',format:'chordpro',sourceType:'manual'},tablature:{instrument:'guitar',sections:[{title:'Intro',content:'e|--0--2--|\nB|--------|\nG|--------|\nD|--------|\nA|--------|\nE|--------|'}]}};
const event={id:'offline-event',title:'Evento automático',remoteVersion:1,leaderId:'A',members:[{id:'A',name:'Músico A',role:'Liderança'}],repertoire:[{id:'offline-item',songId:song.id,shared:{key:'C'},personal:{key:'D',notes:'Minha entrada'}}],date:'2026-10-04'};
async function record(page){return page.evaluate(async()=>{if(!(await indexedDB.databases()).some(db=>db.name==='roudy-event-offline-v1'))return null;return new Promise((resolve,reject)=>{const open=indexedDB.open('roudy-event-offline-v1',1);open.onsuccess=()=>{const db=open.result;if(!db.objectStoreNames.contains('accounts')){db.close();resolve(null);return;}const r=db.transaction('accounts','readonly').objectStore('accounts').get('account:A');r.onsuccess=()=>{resolve(r.result||null);db.close();};r.onerror=()=>reject(r.error);};open.onerror=()=>reject(open.error);});});}
(async()=>{
  let browser;try{
    await new Promise(r=>server.listen(0,'127.0.0.1',r));browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
    const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await context.addInitScript(()=>{
      if(!localStorage.getItem('offline-test-seeded')){localStorage.setItem('offline-test-seeded','1');localStorage.setItem('sc_personal_song_caches_v1',JSON.stringify({A:[]}));localStorage.setItem('sc_personal_event_caches_v1',JSON.stringify({A:[]}));localStorage.setItem('sc_legacy_library_owner_v1','A');localStorage.setItem('sc_legacy_events_owner_v1','A');localStorage.setItem('sc_events_v1','[]');localStorage.setItem('sc_songs_v1','[]');localStorage.setItem('sc_public_auth_config_v1',JSON.stringify({enabled:true,provider:'supabase',supabaseUrl:'https://offline-test.supabase.co',supabaseAnonKey:'public-test'}));localStorage.setItem('sb-offline-test-auth-token',JSON.stringify({access_token:'test-token',user:{id:'A',email:'a@example.test',user_metadata:{full_name:'Músico A'}}}));}
      if(navigator.onLine)window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:JSON.parse(localStorage.getItem('sb-offline-test-auth-token'))}}),onAuthStateChange:()=>{},signOut:async()=>({})},channel:()=>({on(){return this;},subscribe(){return this;},unsubscribe(){}}),removeChannel:async()=>{}})};
    });
    await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));
    await page.route('**/api/**',r=>{const url=new URL(r.request().url());let body={};if(url.pathname.endsWith('/auth/config'))body={enabled:true,supabaseUrl:'https://offline-test.supabase.co',supabaseAnonKey:'public-test'};else if(url.pathname.endsWith('/collaboration/me'))body={id:'A',name:'Músico A'};else if(url.pathname.endsWith('/collaboration/events'))body={events:[event]};else if(url.pathname.endsWith('/library/songs'))body={songs:[{clientId:'offline-client',version:1,songData:song,updatedAt:'2026-10-02'}]};else if(url.pathname.endsWith('/bands'))body={bands:[]};else if(url.pathname.endsWith('/messages'))body={messages:[]};return r.fulfill({json:body});});
    const url=`http://127.0.0.1:${server.address().port}/`;await page.goto(url,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>currentAuthState.authenticated&&!authLinking&&setlists.length===1);
    let saved;for(let i=0;i<80;i++){saved=await record(page);if(saved?.packages?.[0]?.songs?.[0]?.song.fullChordSheet)break;await page.waitForTimeout(100);}
    assert.equal(saved.packages[0].songs[0].song.title,'Canção Offline','salva sem abrir evento ou apertar botão');assert.ok(saved.packages[0].songs[0].song.tablature);assert.equal(saved.packages[0].event.repertoire[0].personalEdits.A.key,'D');
    await page.evaluate(()=>Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>setTimeout(()=>reject(Error('SW timeout')),20000))]));
    await page.route('**/api/**',r=>r.abort('internetdisconnected'));
    await context.setOffline(true);await page.reload({waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>currentAuthState.authenticated&&!authLinking&&setlists.length===1);
    assert.equal(await page.locator('#login-gate').isVisible(),false,'sessão anterior abre sem SDK remoto');
    await page.evaluate(()=>{musicas=musicas.filter(s=>s.id!=='offline-song');renderMusicas();renderSetlists();});
    await page.waitForFunction(()=>eventSongSource(findEvent('offline-event'),findEvent('offline-event').repertoire[0])?.fullChordSheet);
    await page.evaluate(()=>openStageFromEvent('offline-event'));await page.locator('#view-detail.stage-mode').waitFor();
    assert.match(await page.locator('#detail-content').innerText(),/Gancho/);
    await page.evaluate(()=>{currentSongView='full';renderDetail();});assert.match(await page.locator('#detail-content').innerText(),/Letra completa de teste/);
    await page.evaluate(()=>{currentSongView='tablature';renderDetail();});assert.match(await page.locator('#detail-content').innerText(),/0--2/);
    for(const width of [390,1440]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
    assert.equal(await page.getByText('Disponível offline',{exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:/Preparar.*offline/i}).count(),0);
    await page.evaluate(()=>{closeDetail();openEventSongEdit('offline-event','offline-item');});
    await page.locator('#event-song-notes').fill('Ajuste salvo sem rede');await page.getByRole('button',{name:'Salvar',exact:true}).click();
    await page.waitForFunction(()=>findEvent('offline-event').repertoire[0].personalEdits.A.notes==='Ajuste salvo sem rede');
    await page.evaluate(()=>automaticEventOffline.flush());await page.reload({waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>currentAuthState.authenticated&&!authLinking&&setlists.length===1);
    assert.equal(await page.evaluate(()=>findEvent('offline-event').repertoire[0].personalEdits.A.notes),'Ajuste salvo sem rede');
    await page.evaluate(()=>appAuth.signOut());await page.waitForFunction(()=>!currentAuthState.authenticated&&setlists.length===0);assert.equal(await page.evaluate(()=>automaticEventOffline.song({id:'offline-event'},{id:'offline-item',songId:'offline-song'})),null);
    assert.deepEqual(errors,[]);console.log('event-offline-ui.test.js: OK (automático antes de abrir, IndexedDB, sessão offline, reabertura, resumo/cifra/tablatura, mobile/desktop e logout)');
  }finally{await browser?.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
