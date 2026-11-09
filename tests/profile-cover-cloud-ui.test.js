const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path'),{spawn}=require('node:child_process');
const {chromium}=require('playwright');const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{const p=new URL(req.url,'http://localhost').pathname,file=path.resolve(root,p==='/'?'index.html':decodeURIComponent(p.slice(1)));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return res.writeHead(404).end();res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'}[path.extname(file)]||'application/octet-stream')+'; charset=utf-8'});fs.createReadStream(file).pipe(res);});
(async()=>{let browser;const backend=spawn(process.env.ROUDY_TEST_PYTHON||path.join(root,'backend/.venv/Scripts/python.exe'),['-B','-u','tests/playlist-collaboration-server.py'],{cwd:root,windowsHide:true,env:{...process.env,PYTHONIOENCODING:'utf-8'}});
try{
  const fixture=await new Promise((resolve,reject)=>{let output='',errors='';const t=setTimeout(()=>reject(new Error(errors)),20000);backend.stdout.on('data',v=>{output+=v;for(const line of output.split('\n'))if(line.startsWith('{"port"')){clearTimeout(t);resolve(JSON.parse(line));return;}});backend.stderr.on('data',v=>errors+=v);backend.on('error',reject);});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  const errors=[];
  async function device(user){
    const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
    await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));
    await page.route('**/api/**',async route=>{const request=route.request(),url=new URL(request.url());if(url.pathname==='/api/collaboration/me/cover'){
      const result=await context.request.fetch(`http://127.0.0.1:${fixture.port}${url.pathname}`,{method:request.method(),headers:request.headers(),data:request.postData()||undefined});return route.fulfill({status:result.status(),contentType:'application/json',body:await result.body()});
    }return route.fulfill({status:200,json:{}});});
    await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'Continuar sem login'}).click();
    await page.evaluate(async({user,token})=>{window.coverSession={authenticated:true,user:{id:user}};window.appAuth={getState:()=>coverSession,getAccessToken:()=>coverSession.authenticated?token:null};await profileCover.refresh();},{user,token:fixture.tokens[user]});return page;
  }
  const first=await device('test-ana');
  const saved=await first.evaluate(async()=>{
    const canvas=document.createElement('canvas');canvas.width=600;canvas.height=300;canvas.getContext('2d').fillRect(0,0,600,300);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve));await setPlaylistCoverFromFile(new File([blob],'capa.png',{type:'image/png'}));updatePlaylistCoverPosition('x',0);updatePlaylistCoverPosition('y',100);
    if(!await profileCover.flush())throw new Error('Falha ao enviar capa');return profileCover.get();
  });
  const second=await device('test-ana');
  assert.equal(await second.evaluate(()=>playlistCoverImage()),saved.coverImage,'segundo navegador sem cache recupera a foto do banco real');
  assert.deepEqual(await second.evaluate(()=>playlistCoverPosition()),{x:0,y:100});
  await first.route('**/api/collaboration/me/cover',r=>r.fulfill({status:503,json:{erro:{mensagem:'Offline no teste'}}}));
  const blocked=await first.evaluate(async()=>{
    window.coverLogoutWarnings=[];window.coverSignOutCalls=0;window.appAlert=text=>coverLogoutWarnings.push(text);appAuth.signOut=async()=>coverSignOutCalls++;
    profileCover.save(playlistCoverImage(),{x:1,y:100});await logoutAppAccount();
    return {pending:profileCover.get().pending,logoutCalls:coverSignOutCalls,warnings:coverLogoutWarnings};
  });
  assert.equal(blocked.pending,true);assert.equal(blocked.logoutCalls,0,'logout aguarda sincronização da capa');assert.ok(blocked.warnings.some(text=>text.includes('ainda não foi confirmada')));
  const other=await device('test-bruno');assert.equal(await other.evaluate(()=>playlistCoverImage()),'','outro usuário não vê a capa');
  await first.evaluate(()=>{coverSession={authenticated:false,user:null};applyPlaylistCover();});
  assert.equal(await first.evaluate(()=>playlistCoverImage()),'','logout remove a capa da tela sem apagá-la da conta');
  await second.evaluate(async()=>{clearPlaylistCover();if(!await profileCover.flush())throw new Error('Remoção não sincronizada');});
  const third=await device('test-ana');assert.equal(await third.evaluate(()=>playlistCoverImage()),'','remoção fica salva na conta');
  assert.deepEqual(errors,[]);console.log('profile-cover-cloud-ui.test.js: OK (Flask real, banco, 3 navegadores, conta diferente, logout e remoção)');
}finally{await browser?.close();backend.kill();await new Promise(resolve=>server.close(resolve));}})().catch(e=>{console.error(e);process.exitCode=1});
