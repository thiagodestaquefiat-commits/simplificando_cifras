const assert=require('node:assert/strict'),{chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{
  const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/**',r=>r.fulfill({json:{enabled:false,songs:[],events:[],bands:[]}}));
  await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));
  await page.goto('http://127.0.0.1:4173/?foto-perfil-teste=1');await page.waitForFunction(()=>loginGateAuthReady);
  await page.evaluate(()=>{continueWithoutLogin();openProfileSettings();});
  const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=64;c.height=64;c.getContext('2d').fillRect(0,0,64,64);return c.toDataURL('image/png').split(',')[1];});
  await page.locator('#profile-photo-input').setInputFiles({name:'foto.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
  await page.locator('#profile-image-editor').getByRole('button',{name:'Escolher',exact:true}).click();
  const photo=await page.evaluate(()=>pendingProfileAvatar);assert.ok(photo.startsWith('data:image/jpeg;base64,'));
  await page.getByRole('button',{name:'Salvar perfil',exact:true}).click();
  await page.evaluate(()=>{closeModal();openProfileSettings();});
  assert.equal(await page.locator('#account-profile-avatar img').getAttribute('src'),photo);
  await page.reload();await page.waitForFunction(()=>loginGateAuthReady);await page.evaluate(()=>{continueWithoutLogin();openProfileSettings();});
  assert.equal(await page.locator('#account-profile-avatar img').getAttribute('src'),photo,'reabrir a página mantém a foto salva');
  await page.evaluate(()=>{
    closeModal();currentAuthState={authenticated:true,user:{id:'subject-a',avatarUrl:'https://example.test/google.jpg'}};
    appIdentity={status:'supabase',authSubject:'subject-a',user:{id:'internal-a',avatarSet:false}};
    appCurrentUser={id:'internal-a',name:'A'};saveAccountProfile({name:'A',avatarUrl:null});
  });
  assert.equal(await page.evaluate(()=>accountProfile().avatarUrl),null,'remoção não recupera a imagem do Google');
  await page.evaluate(()=>{currentAuthState={authenticated:true,user:{id:'subject-b'}};appCurrentUser={id:'internal-b',name:'B'};});
  assert.equal(await page.evaluate(()=>accountProfile().avatarUrl),null,'não vaza foto da conta A');
  await page.evaluate(()=>{
    currentAuthState={authenticated:true,user:{id:'subject-a',avatarUrl:'https://example.test/google.jpg'}};
    appIdentity={status:'supabase',authSubject:'subject-a',user:{id:'internal-a',avatarSet:true,avatarUrl:'data:image/jpeg;base64,YQ=='}};
    appCurrentUser={id:'internal-a',name:'A'};
    const profiles=accountProfiles();delete profiles['subject-a'];storage.set(ACCOUNT_PROFILES_KEY,profiles);
  });
  assert.equal(await page.evaluate(()=>accountProfile().avatarUrl),'data:image/jpeg;base64,YQ==','outro aparelho recupera a foto da conta, não a do Google');
  await page.evaluate(photo=>{
    saveAccountProfile({name:'A',avatarUrl:photo,avatarPending:true});
    window.appAuth={...appAuth,getState:()=>currentAuthState,signOut:async()=>{currentAuthState={authenticated:false,user:null};appIdentity={status:'local',user:{id:'visitor',name:'Visitante'}};appCurrentUser=appIdentity.user;}};
    window.librarySync={...librarySync,syncNow:async()=>{}};window.syncEventsNow=async()=>{};window.songsPendingUpload=()=>0;window.eventsPendingUpload=()=>0;
  },photo);
  await page.evaluate(()=>logoutAppAccount());await page.waitForTimeout(700);
  assert.equal(await page.evaluate(()=>accountProfiles()['subject-a'].avatarUrl),photo,'logout mantém a foto por conta');
  assert.equal(await page.evaluate(()=>accountProfile().avatarUrl),null,'visitante não herda a foto da conta');
  await page.evaluate(()=>{currentAuthState={authenticated:true,user:{id:'subject-a',avatarUrl:'https://example.test/google.jpg'}};appIdentity={status:'supabase',authSubject:'subject-a',user:{id:'internal-a'}};appCurrentUser=appIdentity.user;openProfileSettings();});
  assert.equal(await page.locator('#account-profile-avatar img').getAttribute('src'),photo,'sair e entrar novamente preserva a foto própria');
  assert.deepEqual(errors,[]);console.log('profile-photo-persistence-ui: OK (upload/recorte, salvar, reabrir, reload, remoção, identidades e recuperação remota)');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
