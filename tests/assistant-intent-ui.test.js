// Usa a prévia real (npm run dev), Python real e reconhecimento de áudio simulado.
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{let browser;try{
  browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/**',route=>route.request().url().startsWith('http://127.0.0.1:4173/api/assistant/')?route.continue():route.fulfill({json:{enabled:false,songs:[],events:[],bands:[]}}));
  await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));
  await page.addInitScript(()=>{
    window.SpeechRecognition=class {constructor(){window.__voiceRecognition=this;}start(){this.onstart?.();}stop(){this.onend?.();}};
    window.speechSynthesis={cancel(){},speak(){}};
  });
  await page.goto('http://127.0.0.1:4173/?teste-intencoes=1',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.roudyIntentClient&&window.roudyAssistant&&loginGateAuthReady);
  await page.evaluate(()=>continueWithoutLogin());
  await page.waitForTimeout(150);
  await page.evaluate(()=>{
    const now=new Date(),near=new Date(now.getTime()+120000),tomorrow=new Date(now),past=new Date(now),later=new Date(now),secret=new Date(now.getTime()+60000);
    tomorrow.setDate(now.getDate()+1);tomorrow.setHours(12,0,0,0);past.setDate(now.getDate()-2);later.setDate(now.getDate()+7);
    const create=(id,date,allowed=true)=>eventModel.create({id,title:'Ensaio '+id,date:`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`,time:`${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`,leaderId:allowed?appCurrentUser.id:'another-user',members:[{id:allowed?appCurrentUser.id:'another-user',name:'Pessoa',role:'Liderança'}],repertoire:[]});
    setlists=[create('passado',past),create('distante',later),create('proximo',near),create('amanha',tomorrow),create('privado',secret,false)];
    openDetail(musicas[0].id);
  });
  const speak=async(button,text)=>{await page.locator(button).click();await page.evaluate(text=>window.__voiceRecognition.onresult({results:[[{transcript:text}]]}),text);};
  await speak('#song-assistant-launch','cara, abre aí o evento que tá mais perto');
  await page.waitForFunction(()=>currentSdId==='proximo'&&roudyAssistant.getLastIntentResult()?.engine==='python');
  assert.equal(await page.locator('#view-sd').isVisible(),true);
  assert.equal(await page.locator('#view-detail').isVisible(),false,'abre evento diretamente, sem tela de música por cima');
  assert.equal(await page.evaluate(()=>roudyAssistant.getLastIntentResult().params.evento_id),2,'evento privado não entrou no contexto enviado');
  await context.setOffline(true);
  await speak('#event-assistant-launch','o que tem amanhã');
  await page.waitForFunction(()=>currentSdId==='amanha'&&roudyAssistant.getLastIntentResult()?.engine==='browser');
  await speak('#event-assistant-launch','não abra o próximo evento');await page.waitForTimeout(60);
  assert.equal(await page.evaluate(()=>currentSdId),'amanha','negação não navega');
  await context.setOffline(false);
  await page.evaluate(()=>{
    window.__oldFetch=window.fetch;window.fetch=()=>new Promise(resolve=>window.__resolveVoiceFetch=resolve);
    window.__voicePending=roudyAssistant.run('abrir próximo evento');
  });
  await page.waitForFunction(()=>Boolean(window.__resolveVoiceFetch));
  await page.evaluate(()=>{appCurrentUser={...appCurrentUser,id:'changed-account'};window.__resolveVoiceFetch({ok:true,json:async()=>({action:'navigate',screen:'detalhes_evento',params:{evento_id:2},intent:'INTENT_PROXIMO_EVENTO',confidence:1,message:'Abrindo.'})});});
  assert.equal((await page.evaluate(()=>window.__voicePending)).ok,false,'resposta da conta antiga descartada');
  assert.equal(await page.evaluate(()=>currentSdId),'amanha');
  assert.deepEqual(errors,[]);
  console.log('assistant-intent-ui.test.js: OK (botão → transcrição simulada → Python → evento, offline e isolamento)');
}finally{await browser?.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
