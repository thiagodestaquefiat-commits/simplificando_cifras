// Busca de música nova pela busca do topo: catálogo ROUDY/web pelo +, Enter e oferta de foto/arquivo quando não acha.
const assert=require('node:assert/strict');const path=require('path'),fs=require('fs'),http=require('http');const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const server=http.createServer((q,r)=>{const p=new URL(q.url,'http://x').pathname;const f=path.resolve(root,p==='/'?'index.html':decodeURIComponent(p.slice(1)));if(!f.startsWith(root)||!fs.existsSync(f)||fs.statSync(f).isDirectory())return r.writeHead(404).end();const t={'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png'};r.writeHead(200,{'Content-Type':t[path.extname(f)]||'application/octet-stream'});fs.createReadStream(f).pipe(r);});
const hit={schemaVersion:2,titulo:'Ruja o Leão',artista:'Fernandinho',tom:'D',confianca:'alta',observacoes:['Cifra obtida de https://www.cifraclub.com.br/x/y/'],harmonicSummary:{blocos:[{acordes:['D','G','A'],repeticoes:4,fraseGuia:'Ruja o leão',secao:null}]}};
(async()=>{try{await new Promise(res=>server.listen(0,'127.0.0.1',res));const base='http://127.0.0.1:'+server.address().port+'/';
const b=await chromium.launch();const ctx=await b.newContext({serviceWorkers:'block',viewport:{width:390,height:844}});const page=await ctx.newPage();const errs=[];page.on('pageerror',e=>errs.push(e.message));
let mode='hit';const calls=[];
await page.route('**/*',async r=>{const u=r.request().url();if(u.startsWith(base))return r.continue();
 if(u.includes('/api/music-sources/search')){calls.push('search');return r.fulfill({status:200,contentType:'application/json',body:'{"candidates":[]}'});}
 if(u.includes('/api/resumo-harmonico')){calls.push('gerar:'+r.request().postData());
   if(mode==='hit')return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(hit)});
   return r.fulfill({status:404,contentType:'application/json',body:JSON.stringify({erro:{codigo:'cifra_nao_encontrada',mensagem:'x'}})});}
 return r.abort();});
await page.goto(base);await page.waitForTimeout(1500);try{await page.getByText('Continuar sem login').first().click({timeout:2000})}catch(e){}
await page.evaluate(()=>{window.appAuth={...window.appAuth,getAccessToken:()=>'fake'}});
const before=await page.evaluate(()=>musicas.length);
// A: digitar -> linha aparece; + adiciona
await page.evaluate(()=>openPlaylistSearch());await page.fill('#search-music','Ruja o Leão - Fernandinho');await page.waitForTimeout(1200);
const callsTyping=calls.splice(0);

await page.click('[data-playlist-catalog-search]');await page.waitForTimeout(1200);

const A={callsTyping,callsAdd:calls.splice(0),added:await page.evaluate(n=>musicas.length-n,before),last:await page.evaluate(()=>{const m=musicas.find(x=>/Ruja/.test(x.title));return m&&{t:m.title,a:m.artist,k:m.key}}),status:await page.evaluate(()=>document.querySelector('.playlist-search-online-status')?.innerText)};
// B: nao encontrada via Enter
mode='miss';await page.fill('#search-music','Musica Inexistente');await page.waitForTimeout(1200);await page.press('#search-music','Enter');await page.waitForTimeout(1200);

const B={calls:calls.splice(0),status:await page.evaluate(()=>document.querySelector('.playlist-search-online-status')?.innerText)};
await page.getByText('Enviar PDF ou arquivo').click();await page.waitForTimeout(700);

const C=await page.evaluate(()=>({modal:!!document.getElementById('ai-summary-overlay'),titulo:document.querySelector('[data-ai-form=arquivo] input[name=titulo]')?.value,visivel:!document.querySelector('[data-ai-form=arquivo]')?.hidden}));
// D: busca do cartão "O que vamos tocar hoje?" (Pesquisar)
await page.evaluate(()=>{try{aiHarmonicSummary.close()}catch(e){}});await page.evaluate(()=>{const o=document.getElementById('ai-summary-overlay');if(o)o.remove()});
mode='hit';await page.evaluate(()=>{musicas=musicas.filter(m=>!/Ruja/.test(m.title))});
await page.evaluate(()=>aiHarmonicSummary.openSearch());await page.fill('[name="ai-search-title"]','Ruja o Leão - Fernandinho');
await page.evaluate(()=>document.querySelector('#playlist-ai-search-mode form').requestSubmit());await page.waitForTimeout(1500);
const D={calls:calls.splice(0),status:await page.evaluate(()=>document.querySelector('[data-ai-search-status]')?.innerText),has:await page.evaluate(()=>musicas.some(m=>/Ruja/.test(m.title)))};
mode='miss';await page.fill('[name="ai-search-title"]','Musica Inexistente');await page.evaluate(()=>document.querySelector('#playlist-ai-search-mode form').requestSubmit());await page.waitForTimeout(1500);
const E={status:await page.evaluate(()=>document.querySelector('[data-ai-search-status]')?.innerText)};
assert.ok(D.calls.some(c=>/"modoGeracao":"conhecimento_modelo"/.test(c)),'Pesquisar do cartão procura no catálogo/web');assert.equal(D.has,true);assert.match(D.status,/adicionada/);
assert.match(E.status,/Enviar foto/);assert.match(E.status,/Enviar PDF ou arquivo/);
assert.deepEqual(A.callsTyping,['search'],'digitar não pode disparar busca na web');
assert.equal(A.callsAdd.length,1);assert.match(A.callsAdd[0],/"modoGeracao":"conhecimento_modelo"/);assert.match(A.callsAdd[0],/"artista":"Fernandinho"/);
assert.equal(A.added,1);assert.deepEqual(A.last,{t:'Ruja o Leão',a:'Fernandinho',k:'D'});
assert.ok(B.calls.some(c=>c.startsWith('gerar:')),'Enter procura no catálogo/web');assert.match(B.status,/Enviar foto/);assert.match(B.status,/Enviar PDF ou arquivo/);
assert.deepEqual(C,{modal:true,titulo:'Musica Inexistente',visivel:true});assert.deepEqual(errs,[]);
console.log('playlist-catalog-search-ui.test.js: OK (catálogo/web pelo +, Enter e foto/arquivo quando não acha)');await b.close();}finally{server.close();}})().catch(e=>{console.error(e);process.exit(1)});
