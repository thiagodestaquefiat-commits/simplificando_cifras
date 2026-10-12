const assert=require('node:assert/strict'),{chromium}=require('playwright');
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  try{
    const page=await browser.newPage({serviceWorkers:'block'}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/api/**',r=>r.fulfill({json:{enabled:false,songs:[],events:[],bands:[]}}));
    await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));
    await page.goto('http://127.0.0.1:4173/?integration-invites=1');
    await page.waitForFunction(()=>loginGateAuthReady);await page.evaluate(()=>{
      continueWithoutLogin();window.__sent=[];window.__failedOnce=false;
      window.eventCollaboration=Object.freeze({...eventCollaboration,
        saveSharedEvent:async e=>({...e,remoteVersion:1,pendingShared:false}),
        inviteUser:async(id,user,role)=>{if(user==='invite-b'&&!window.__failedOnce){window.__failedOnce=true;throw new Error('falha simulada');}window.__sent.push([id,user,role]);return {id:user};}
      });
      openAddSetlist();document.getElementById('fs-title').value='Evento de integração';
      eventQueueInvite({id:'invite-a',name:'Ana'});eventQueueInvite({id:'invite-b',name:'Bruno'});
      eventSetInviteRole(0,'Guitarra');
    });
    assert.equal(await page.evaluate(()=>eventQueueInvite({id:'invite-a',name:'Ana'})),false);
    assert.equal(await page.locator('.event-member-editor--pending').count(),2);
    await page.evaluate(()=>saveSetlist({keepOpen:true}));
    assert.equal(await page.evaluate(()=>window.__sent.length),0,'save intermediário não envia convites');
    await page.evaluate(()=>saveSetlist());
    assert.deepEqual(await page.evaluate(()=>eventQueuedInviteIds()),['invite-b']);
    assert.equal(await page.evaluate(()=>window.__sent.length),1,'sucesso parcial não perde convite pendente');
    await page.evaluate(()=>saveSetlist());
    const sent=await page.evaluate(()=>window.__sent);
    assert.deepEqual(sent.map(v=>v[1]),['invite-a','invite-b'],'retry não duplica convite já enviado');
    assert.equal(sent[0][2],'Guitarra');
    assert.equal(await page.evaluate(id=>findEvent(id).members.some(m=>m.id==='invite-a'||m.id==='invite-b'),sent[0][0]),false,'convites não adicionam membro sem aceite');
    assert.deepEqual(errors,[]);console.log('event-multiple-invites-ui: OK (fila, duplicidade, salvamento, falha parcial, retry e aceite)');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
