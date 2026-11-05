const assert=require('node:assert/strict'),path=require('node:path'),{chromium}=require('playwright');
(async()=>{const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});try{
  const page=await browser.newPage({viewport:{width:390,height:844}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>r.fulfill({contentType:'text/html',body:'<div id="event-chat-view"><div class="event-chat-messages"></div><div class="event-chat-composer"><textarea id="event-chat-input"></textarea><button class="event-chat-send">Enviar</button></div></div>'}));
  await page.goto('http://localhost:4199/');await page.addStyleTag({path:path.resolve('css/event-chat-audio.css')});
  await page.evaluate(()=>{
    window.appAuth={getState:()=>({authenticated:true,user:{id:'audio-test'}}),getAccessToken:()=> 'fixture',subscribe:()=>{}};window.showToast=()=>{};window.apiConfig={collaborationEndpoint:p=>p};window.sent=0;window.fail=false;window.stopped=0;
    Object.defineProperty(navigator,'mediaDevices',{value:{getUserMedia:async()=>({getTracks:()=>[{stop(){stopped++;}}]})},configurable:true});
    window.MediaRecorder=class{static isTypeSupported(){return true}constructor(){this.state='inactive';this.mimeType='audio/webm'}start(){this.state='recording'}pause(){this.state='paused'}resume(){this.state='recording'}stop(){this.state='inactive';this.ondataavailable({data:new Blob(['fixture'],{type:this.mimeType})});setTimeout(()=>this.onstop(),0)}};
    window.fetch=async()=>{sent++;return{ok:!fail,json:async()=>fail?{erro:{mensagem:'Falha simulada'}}:{id:'voice-'+sent,eventId:'event',type:'audio',sender:{name:'Ana'},audio:{duration:1}}}};
  });
  await page.addScriptTag({path:path.resolve('js/event-chat-audio.js')});await page.evaluate(()=>eventChatAudio.initialize({getEvent:()=>({id:'event'}),onMessage:m=>eventChatAudio.render(document.querySelector('.event-chat-messages'),m)}));
  await page.getByRole('button',{name:'Gravar áudio',exact:true}).click();await page.waitForSelector('.event-audio-tools.is-recording');await page.waitForTimeout(450);
  assert.equal(await page.evaluate(()=>sent),0,'release never sends without explicit action');
  await page.getByRole('button',{name:'Pausar gravação'}).click();await page.getByRole('button',{name:'Retomar gravação'}).click();
  await page.getByRole('button',{name:'Enviar áudio',exact:true}).click();await page.waitForSelector('.event-audio-message');assert.equal(await page.evaluate(()=>sent),1);
  assert.equal(await page.locator('.event-audio-message audio').isVisible(),false);assert.equal(await page.locator('.event-audio-progress').count(),1);
  await page.getByRole('button',{name:'Gravar áudio',exact:true}).click();await page.waitForSelector('.event-audio-tools.is-recording');await page.getByRole('button',{name:'Descartar',exact:true}).click();assert.equal(await page.evaluate(()=>sent),1);
  await page.evaluate(()=>fail=true);await page.getByRole('button',{name:'Gravar áudio',exact:true}).click();await page.waitForSelector('.event-audio-tools.is-recording');await page.waitForTimeout(450);await page.getByRole('button',{name:'Enviar áudio',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.event-audio-tools').textContent.includes('preservada'));
  await page.evaluate(()=>fail=false);await page.getByRole('button',{name:'Enviar áudio',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.event-audio-message').length===2);assert.equal(await page.evaluate(()=>sent),3);
  assert.deepEqual(errors,[]);console.log('chat-audio-controls-ui: OK (explicit send, pause/resume, discard, retry, custom playback controls)');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
