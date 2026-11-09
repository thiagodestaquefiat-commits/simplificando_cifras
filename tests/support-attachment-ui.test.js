const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{const p=new URL(req.url,'http://localhost').pathname,file=path.resolve(root,p==='/'?'index.html':decodeURIComponent(p.slice(1)));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return res.writeHead(404).end();res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'}[path.extname(file)]||'application/octet-stream')+'; charset=utf-8'});fs.createReadStream(file).pipe(res);});
(async()=>{let browser;try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  const page=await browser.newPage({viewport:{width:390,height:844},serviceWorkers:'block'}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({contentType:'text/css',body:''}));
  await page.route('**/api/**',route=>route.fulfill({status:200,json:{}}));
  await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:'domcontentloaded'});
  await page.getByRole('button',{name:'Continuar sem login'}).click();

  await page.evaluate(()=>{
    window.appAuth={...appAuth,getState:()=>({authenticated:true,user:{id:'support-test'}}),getAccessToken:()=> 'fake-token'};
    openAccountDrawerHelpSupport();
  });
  await page.getByRole('button',{name:/Relatar bugs/}).click();

  assert.equal(await page.locator('#bug-image').getAttribute('accept'),'image/png,image/jpeg');
  await page.locator('#bug-image').setInputFiles({name:'bad.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg/>')});
  await page.locator('#bug-image-status').filter({hasText:'não são aceitos'}).waitFor();
  assert.equal(await page.locator('.support-attachment-preview').isVisible(),false);
  const encoded=await page.evaluate(()=>{
    const canvas=document.createElement('canvas');canvas.width=2400;canvas.height=1200;
    const ctx=canvas.getContext('2d');ctx.fillStyle='#222';ctx.fillRect(0,0,2400,1200);
    ctx.fillStyle='white';ctx.font='60px sans-serif';ctx.fillText('ROUDY — print de teste',80,120);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  async function attach(){
    await page.locator('#bug-image').setInputFiles({name:'print.png',mimeType:'image/png',buffer:Buffer.from(encoded,'base64')});
    await page.locator('.support-attachment-preview').waitFor({state:'visible'});
  }
  await attach();
  assert.equal(await page.locator('#bug-image').evaluate(el=>el.files[0]?.name),'print.png','seletor mantém o arquivo que aparece na prévia');
  assert.equal(await page.locator('.support-attachment-preview img').evaluate(el=>el.naturalWidth),2000);
  await page.getByRole('button',{name:'Remover imagem',exact:true}).click();
  assert.equal(await page.locator('.support-attachment-preview').isVisible(),false);
  await attach();
  await page.locator('#bug-description').fill('A notificação não sumiu após ler todas.');
  let requests=0,previousId;
  await page.route('**/api/collaboration/bug-reports',async route=>{
    requests++;const body=route.request().postData();
    assert.match(route.request().headers()['content-type'],/multipart\/form-data/);
    assert.match(body,/name="image"/);assert.match(body,/name="description"/);
    const id=body.match(/name="clientId"\r\n\r\n([^\r]+)/)[1];
    if(previousId)assert.equal(id,previousId);previousId=id;
    if(requests===1)return route.fulfill({status:503,json:{erro:{mensagem:'Tente novamente'}}});
    if(requests===2)return route.fulfill({status:429,json:{erro:{mensagem:'Aguarde antes de tentar novamente.'}}});
    if(requests===3)return route.fulfill({status:201,json:{id,emailStatus:'retry'}});
    return route.fulfill({status:201,json:{id,emailStatus:'accepted'}});
  });
  await page.getByRole('button',{name:'Enviar relato',exact:true}).click();
  await page.locator('#bug-report-status').filter({hasText:'O texto continua aqui'}).waitFor();
  assert.equal(await page.locator('.support-attachment-preview').isVisible(),true);
  assert.equal(await page.locator('#bug-description').isDisabled(),true,'falha ambígua mantém o conteúdo original');
  assert.equal(await page.locator('#bug-image').isDisabled(),true);
  await page.getByRole('button',{name:'Enviar relato',exact:true}).click();
  await page.locator('#bug-report-status').filter({hasText:'Aguarde antes'}).waitFor();
  assert.equal(await page.locator('#bug-description').isDisabled(),true,'um limite posterior não resolve o envio anterior ainda incerto');
  await page.getByRole('button',{name:'Enviar relato',exact:true}).click();
  await page.locator('#bug-report-status').filter({hasText:'o e-mail não foi encaminhado'}).waitFor();
  assert.equal(await page.locator('.support-attachment-preview').isVisible(),true);
  assert.equal(await page.locator('#bug-description').isDisabled(),false,'rejeição confirmada libera edição');
  assert.equal(await page.locator('#bug-image').isDisabled(),false);
  await page.getByRole('button',{name:'Enviar relato',exact:true}).click();
  await page.locator('#bug-report-status').filter({hasText:'Protocolo:'}).waitFor();
  assert.equal(requests,4);
  // An ambiguous provider outcome must not encourage a duplicate email.
  await page.evaluate(()=>openBugReportForm());
  await page.locator('#bug-description').fill('Outro relato de teste para resultado incerto.');
  await page.route('**/api/collaboration/bug-reports',route=>route.fulfill({status:200,json:{id:'uncertain-test',emailStatus:'uncertain'}}));
  await page.getByRole('button',{name:'Enviar relato',exact:true}).click();
  await page.locator('#bug-report-status').filter({hasText:'não envie novamente'}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Verificação pendente',exact:true}).isDisabled(),true);
  await page.evaluate(()=>openBugReportForm());
  await page.locator('#bug-description').fill('Relato com resposta inesperada do servidor.');
  await page.route('**/api/collaboration/bug-reports',route=>route.fulfill({status:502,contentType:'text/html',body:'<html>Gateway error</html>'}));
  await page.getByRole('button',{name:'Enviar relato',exact:true}).click();
  await page.locator('#bug-report-status').filter({hasText:'Não foi possível confirmar'}).waitFor();
  assert.doesNotMatch(await page.locator('#bug-report-status').textContent(),/Unexpected|JSON|SyntaxError/);
  assert.equal(await page.locator('#bug-description').isDisabled(),true);
  assert.deepEqual(errors,[]);
  console.log('support-attachment-ui.test.js: OK');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}})().catch(error=>{console.error(error);process.exitCode=1;});
