const assert=require('node:assert/strict'),path=require('node:path'),{chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setContent('<!doctype html><html><body style="margin:0;background:#08090a"></body></html>');
  for(const file of ['js/profile-qr.css','js/event-qr-scanner.css','css/qr-stage-light.css'])await page.addStyleTag({path:file});
  for(const file of ['js/vendor/qrcode.min.js','js/vendor/jsqr.min.js'])await page.addScriptTag({path:file});
  await page.evaluate(()=>{
   window.__stopped=0;window.__permission='ok';window.__reads=0;window.__raw='';window.__invites=[];window.__profiles=[];
   window.accountProfile=()=>({id:'tester',name:'Teste'});window.roudyQrLibs={code:async()=>{},reader:async()=>{}};
   window.eventCollaboration={searchUsers:async id=>{window.__profiles.push(id);return {users:[{id,name:'Pessoa de teste'}]};}};
   window.eventUserInvites={inviteScanned:async(event,id,role)=>{window.__invites.push({event,id,role});return {id,name:'Pessoa de teste'};}};
   window.BarcodeDetector=class{static async getSupportedFormats(){return ['qr_code'];}async detect(){window.__reads++;return window.__raw?[{rawValue:window.__raw}]:[];}};
   Object.defineProperty(HTMLMediaElement.prototype,'srcObject',{configurable:true,get(){return this.__stream||null;},set(value){this.__stream=value;}});
   HTMLMediaElement.prototype.play=async function(){};
   const makeStream=()=>({getTracks:()=>[{stop:()=>window.__stopped++}],getVideoTracks:()=>[{getCapabilities:()=>({torch:false})}]});
   Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:async options=>{
    window.__constraints=options;if(window.__permission==='denied')throw new DOMException('denied','NotAllowedError');
    if(window.__permission==='pending')return new Promise(resolve=>window.__releaseCamera=()=>resolve(makeStream()));return makeStream();
   }}});
  });
  for(const file of ['js/event-qr-scanner.js','js/profile-qr.js'])await page.addScriptTag({path:file});
  await page.evaluate(()=>profileQr.open());assert.equal(await page.evaluate(()=>window.__constraints),undefined,'share tab never requests camera');
  await page.locator('[data-profile-qr-tab=scan]').click();await page.waitForFunction(()=>document.querySelector('#profile-qr-video').srcObject!==null);
  assert.equal(await page.evaluate(()=>window.__constraints.video.facingMode.ideal),'environment');
  for(const [width,height] of [[375,667],[390,844],[430,932],[768,1024],[844,390]]){
   await page.setViewportSize({width,height});
   const metrics=await page.evaluate(()=>{const q=s=>document.querySelector(s),r=s=>q(s).getBoundingClientRect().toJSON();return {frame:r('.profile-qr-frame'),gallery:r('.profile-qr-scan .roudy-stage-gallery'),close:r('.profile-qr-scan .roudy-stage-close'),scroll:q('#profile-qr-view').scrollWidth,background:getComputedStyle(q('.profile-qr-scan .roudy-stage-wash')).backgroundImage,filter:getComputedStyle(q('#profile-qr-video')).filter};});
   assert.ok(metrics.frame.top>=0&&metrics.frame.bottom<=height,`${width} frame clipped`);assert.ok(metrics.gallery.bottom<=height,`${width} gallery clipped`);assert.ok(metrics.close.width>=44&&metrics.close.height>=44);assert.ok(metrics.scroll<=width);assert.match(metrics.background,/radial-gradient/);assert.equal(metrics.filter,'none');
  }
  await page.setViewportSize({width:390,height:844});
  if(process.env.REVIEW_SCREENSHOT)await page.screenshot({path:process.env.REVIEW_SCREENSHOT});
  const before=await page.evaluate(()=>window.__stopped);await page.locator('.profile-qr-scan .roudy-stage-close').click();assert.ok(await page.evaluate(()=>window.__stopped)>before);
  // A sustained native detector result is handled once, never once per animation frame.
  await page.evaluate(()=>{void profileQr.open();});await page.locator('[data-profile-qr-tab=scan]').click();await page.waitForFunction(()=>document.querySelector('#profile-qr-video').srcObject!==null);
  await page.evaluate(()=>{window.__raw='roudy://profile/native-user';Object.defineProperty(document.querySelector('#profile-qr-video'),'readyState',{configurable:true,value:4});});
  await page.waitForFunction(()=>document.querySelector('#profile-qr-status').textContent.includes('Perfil encontrado'));await page.waitForTimeout(350);assert.deepEqual(await page.evaluate(()=>window.__profiles),['native-user']);await page.evaluate(()=>{window.__raw='';profileQr.close();});
  // Closing while a permission promise is unresolved releases the later stream as well.
  await page.evaluate(()=>{window.__permission='pending';});await page.evaluate(()=>{void profileQr.open();});await page.locator('[data-profile-qr-tab=scan]').click();await page.waitForFunction(()=>window.__releaseCamera);
  await page.locator('.profile-qr-scan .roudy-stage-close').click();const stopped=await page.evaluate(()=>window.__stopped);await page.evaluate(()=>window.__releaseCamera());await page.waitForTimeout(40);assert.equal(await page.evaluate(()=>window.__stopped),stopped+1);assert.equal(await page.evaluate(()=>document.querySelector('#profile-qr-video').srcObject),null);
  await page.evaluate(()=>{window.__permission='denied';void profileQr.open();});await page.locator('[data-profile-qr-tab=scan]').click();await page.waitForFunction(()=>document.querySelector('#profile-qr-status').textContent.includes('não foi autorizada'));assert.equal(await page.locator('.profile-qr-scan .roudy-stage-gallery').isVisible(),true);
  // Real QR pixels decoded by the existing jsQR fallback; no camera/hardware required.
  const image=await page.evaluate(()=>{delete window.BarcodeDetector;const host=document.createElement('div');new QRCode(host,{text:'roudy://profile/gallery-user',width:256,height:256,correctLevel:QRCode.CorrectLevel.H});return host.querySelector('canvas').toDataURL('image/png').split(',')[1];});
  await page.locator('#profile-qr-file').setInputFiles({name:'qr.png',mimeType:'image/png',buffer:Buffer.from(image,'base64')});await page.waitForFunction(()=>document.querySelector('#profile-qr-status').textContent.includes('Perfil encontrado'));assert.deepEqual(await page.evaluate(()=>window.__profiles),['native-user','gallery-user']);
  await page.evaluate(()=>profileQr.close());
  await page.evaluate(()=>{void eventQrScanner.open('event-test',{role:'Vocalista'});});await page.waitForFunction(()=>document.querySelector('#event-qr-status').textContent.includes('não foi autorizada'));
  await page.locator('#event-qr-file').setInputFiles({name:'qr.png',mimeType:'image/png',buffer:Buffer.from(image,'base64')});await page.waitForFunction(()=>document.querySelector('#event-qr-scanner').hidden);assert.deepEqual(await page.evaluate(()=>window.__invites),[{event:'event-test',id:'gallery-user',role:'Vocalista'}]);
  // Invalid payloads never trigger an invitation; closing still works.
  await page.evaluate(()=>{window.BarcodeDetector=class{static async getSupportedFormats(){return ['qr_code'];}async detect(){return [{rawValue:'javascript:alert(1)'}];}};void eventQrScanner.open('event-test');});
  await page.locator('#event-qr-file').setInputFiles({name:'invalid.png',mimeType:'image/png',buffer:Buffer.from(image,'base64')});await page.waitForFunction(()=>document.querySelector('#event-qr-status').textContent.includes('válido'));assert.equal(await page.evaluate(()=>window.__invites.length),1);
  await page.keyboard.press('Escape');assert.equal(await page.locator('#event-qr-scanner').isVisible(),false);
  await page.emulateMedia({reducedMotion:'reduce'});assert.deepEqual(errors,[]);
  console.log('qr-stage-light-ui.test.js: OK (5 layouts, permissions, cleanup/race, real gallery QR fallback, identity validation, event role)');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
