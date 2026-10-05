const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
(async()=>{
  const executablePath=['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].find(fs.existsSync);
  const browser=await chromium.launch({headless:true,executablePath});
  try{
    for(const width of [390,1366]){
      const page=await browser.newPage({viewport:{width,height:844}}),errors=[];
      page.on('pageerror',error=>errors.push(error.message));
      await page.setContent('<style>*{box-sizing:border-box}.btn,.form-input,.form-textarea{display:block;width:100%;padding:12px;margin:8px 0}.wa-block{border:1px solid;padding:16px}#modal-body{max-width:750px;margin:auto;padding:14px}pre{max-width:100%}</style><div id="actions"></div><div id="review"></div><div id="modal-overlay"><div id="modal-body"></div></div>');
      await page.evaluate(()=>{
        window.token='a';window.sends=0;window.fail=false;
        window.appAuth={getAccessToken:()=>window.token};window.apiConfig={sharedSongsEndpoint:p=>'https://test/'+p};
        window.closeModal=()=>document.getElementById('modal-overlay').style.display='none';
        window.accountSubpageHeader=t=>'<h2>'+t+'</h2>';window.openHelpSupport=()=>{};
        window.fetch=async(url,options)=>{
          if(url.includes('report-target'))return{ok:true,json:async()=>({song:{id:'s1',title:'<img src=x onerror=alert(1)>',artist:'Artista'}})};
          if(url.endsWith('review-capability'))return{ok:true,json:async()=>({canReview:true})};
          if(url.includes('reports?'))return{ok:true,json:async()=>({reports:[{id:'r1',title:'Título',artist:'Artista',reason:'lyrics',details:'<script>bad()</script>',status:'pending',reviewNote:'',songData:{fullChordSheet:{content:'C G\nLetra original'}}}],hasMore:false})};
          if(window.fail)throw new TypeError('offline');
          window.sends++;return{ok:true,json:async()=>({report:{id:'r1',status:'pending'}})};
        };
      });
      await page.addScriptTag({path:path.resolve(__dirname,'../js/song-reports.js')});
      await page.evaluate(()=>songReports.attach({title:'Canção',artist:'Artista'},document.getElementById('actions')));
      await page.getByRole('button',{name:'Reportar problema'}).click();
      assert.equal(await page.locator('#modal-body img').count(),0);
      await page.locator('#song-report-details').fill('Problema no refrão');
      await page.evaluate(()=>window.fail=true);
      await page.getByRole('button',{name:'Enviar relato'}).click();
      await page.getByText('Sem conexão com o servidor. Tente novamente.').waitFor();
      assert.equal(await page.getByRole('button',{name:'Enviar relato'}).isEnabled(),true);
      assert.equal(await page.locator('#song-report-details').inputValue(),'Problema no refrão');
      await page.evaluate(()=>window.fail=false);
      await page.getByRole('button',{name:'Enviar relato'}).click();
      await page.getByText('Relato enviado para revisão. Obrigado!').waitFor();
      assert.equal(await page.evaluate(()=>window.sends),1);
      await page.evaluate(()=>songReports.attachReview(document.getElementById('review')));
      await page.getByRole('button',{name:'Revisar relatos'}).click();
      await page.getByText('Ver cifra do catálogo').click();
      await page.getByText('C G\nLetra original',{exact:true}).waitFor();
      assert.equal(await page.locator('#review-reports script').count(),0);
      await page.locator('.wa-block select').selectOption('in_review');
      await page.getByRole('button',{name:'Salvar revisão'}).click();
      await page.getByText('Revisão salva.').waitFor();
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'sem overflow');
      assert.deepEqual(errors,[]);await page.close();
    }
    console.log('song-reports-ui.test.js: OK (mobile/desktop, envio, retry, revisão e XSS)');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
