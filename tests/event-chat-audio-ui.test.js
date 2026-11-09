const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path'),{spawn}=require('node:child_process');
const {chromium}=require('playwright');const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{const p=new URL(req.url,'http://localhost').pathname,file=path.resolve(root,p==='/'?'index.html':decodeURIComponent(p.slice(1)));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return res.writeHead(404).end();res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png'}[path.extname(file)]||'application/octet-stream')+'; charset=utf-8'});fs.createReadStream(file).pipe(res);});
(async()=>{let browser;const backend=spawn(path.join(root,'backend/.venv/Scripts/python.exe'),['-B','-u','tests/playlist-collaboration-server.py'],{cwd:root,windowsHide:true,env:{...process.env,PYTHONIOENCODING:'utf-8'}});
try{
  const fixture=await new Promise((resolve,reject)=>{let output='',errors='';const t=setTimeout(()=>reject(new Error(errors)),20000);backend.stdout.on('data',v=>{output+=v;for(const line of output.split('\n'))if(line.startsWith('{"port"')){clearTimeout(t);resolve(JSON.parse(line));return;}});backend.stderr.on('data',v=>errors+=v);backend.on('error',reject);});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
  const context=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844}}),page=await context.newPage(),errors=[];let fail=false,posts=0;
  page.on('pageerror',e=>errors.push(e.message));await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));
  await page.route('**/api/**',async route=>{const request=route.request(),url=new URL(request.url());if(url.pathname.startsWith('/api/collaboration/events')){
    if(url.pathname.endsWith('/messages/audio')&&request.method()==='POST'){posts++;if(fail)return route.fulfill({status:503,contentType:'text/html',body:'<html>Gateway unavailable</html>'});}
    const result=await context.request.fetch(`http://127.0.0.1:${fixture.port}${url.pathname}${url.search}`,{method:request.method(),headers:request.headers(),data:request.postDataBuffer()||undefined});return route.fulfill({status:result.status(),headers:result.headers(),body:await result.body()});
  }return route.fulfill({status:200,json:{}});});
  const created=await context.request.post(`http://127.0.0.1:${fixture.port}/api/collaboration/events`,{headers:{Authorization:'Bearer '+fixture.tokens['test-ana']},data:{id:'audio-test',title:'Ensaio de domingo',leaderId:'test-ana',members:[{id:'test-ana',name:'Ana',role:'Vocal'},{id:'test-bruno',name:'Bruno',role:'Guitarra'}],repertoire:[]}});
  assert.equal(created.status(),201);const event=await created.json();
  await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'Continuar sem login'}).click();
  await page.evaluate(async({token,event})=>{window.appAuth={getState:()=>({authenticated:true,user:{id:'test-ana'}}),getAccessToken:()=>token};currentAuthState=appAuth.getState();appCurrentUser={id:'test-ana',name:'Ana',role:'Vocal'};setlists=[eventModel.create(event)];currentSdId=event.id;await openEventChat();},{token:fixture.tokens['test-ana'],event});
  const mic=page.getByRole('button',{name:'Segure para gravar áudio'});
  async function hold(){await mic.hover();await page.mouse.down();await page.waitForFunction(()=>document.querySelector('.event-chat-mic.is-recording'));await page.waitForTimeout(650);}
  await hold();await page.mouse.up();await page.waitForFunction(()=>document.querySelectorAll('.event-audio-message').length===1);
  assert.equal(posts,1);
  await page.waitForFunction(()=>document.querySelector('.event-audio-tools [role="status"]').textContent==='');
  assert.equal(await page.locator('.event-audio-tools').isVisible(),false,'sucesso não deixa mensagem ou faixa vazia no compositor');
  fs.mkdirSync(path.join(root,'artifacts'),{recursive:true});await page.screenshot({path:path.join(root,'artifacts/chat-audio-mobile.png')});
  await page.getByRole('button',{name:'Reproduzir mensagem de áudio'}).click();await page.waitForFunction(()=>document.querySelector('.event-audio-message audio')?.src.startsWith('blob:'));
  assert.ok(await page.locator('.event-audio-message audio').isVisible());
  await page.waitForFunction(()=>{const a=document.querySelector('.event-audio-message audio');return a.readyState>=2&&a.currentTime>0&&!a.error;});
  const audioSrc=await page.locator('.event-audio-message audio').getAttribute('src');await page.evaluate(()=>renderEventChatMessages(false));
  assert.equal(await page.locator('.event-audio-message audio').getAttribute('src'),audioSrc,'atualização do histórico preserva o mesmo player');
  await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
  await page.getByRole('button',{name:'Reproduzir mensagem de áudio'}).click();
  await page.waitForFunction(()=>document.querySelector('.event-audio-message audio')?.src.startsWith('blob:'));
  await hold();const box=await mic.boundingBox();await page.mouse.move(box.x-100,box.y);await page.mouse.up();await page.waitForTimeout(350);assert.equal(posts,1,'arrastar cancela sem enviar');
  fail=true;await hold();await page.mouse.up();await page.getByRole('button',{name:'Enviar áudio',exact:true}).waitFor({state:'visible'});await page.waitForFunction(()=>document.querySelector('.event-audio-tools')?.textContent.includes('preservada'));
  assert.equal(posts,2);fail=false;await page.getByRole('button',{name:'Enviar áudio',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.event-audio-message').length===2);
  assert.equal(posts,3,'nova tentativa utiliza a gravação preservada');
  await hold();await page.evaluate(()=>closeEventChat());await page.mouse.up();await page.waitForTimeout(350);assert.equal(posts,3,'sair do chat cancela a gravação');
  await page.evaluate(async()=>{
    await openEventChat();window.originalGetUserMedia=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia=()=>Promise.reject(new DOMException('denied','NotAllowedError'));
  });
  await mic.hover();await page.mouse.down();await page.waitForFunction(()=>document.querySelector('.event-audio-tools').textContent.includes('Permita o microfone'));await page.mouse.up();
  assert.equal(posts,3,'negar permissão nunca envia áudio');
  await page.evaluate(()=>{navigator.mediaDevices.getUserMedia=()=>new Promise(resolve=>{window.grantLater=async()=>{const stream=await originalGetUserMedia({audio:true});window.lateStream=stream;resolve(stream);};});});
  await mic.hover();await page.mouse.down();await page.waitForFunction(()=>!!window.grantLater);await page.mouse.up();
  await page.evaluate(()=>grantLater());await page.waitForFunction(()=>lateStream.getTracks().every(track=>track.readyState==='ended'));
  assert.equal(posts,3,'soltar antes de conceder permissão descarta a captura tardia');
  assert.deepEqual(errors,[]);console.log('event-chat-audio-ui.test.js: OK (microfone sintético, Flask real, transcodificação, reprodução, cancelamento, falha/retry e saída)');
}finally{await browser?.close();backend.kill();await new Promise(resolve=>server.close(resolve));}})().catch(e=>{console.error(e);process.exitCode=1});
