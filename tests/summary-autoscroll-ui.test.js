const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{
  const file=path.resolve(root,new URL(req.url,'http://localhost').pathname.slice(1)||'index.html');
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||fs.statSync(file).isDirectory())return res.writeHead(404).end();
  res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css'})[path.extname(file)]||'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  let reference;
  try{
    for(const viewport of [{width:360,height:800},{width:390,height:844},{width:412,height:915},{width:844,height:390},{width:768,height:1024},{width:1366,height:768}]){
      const context=await browser.newContext({viewport});
      await context.addInitScript(()=>{
        let time=1000,next=0;const frames=new Map();
        Object.defineProperty(performance,'now',{value:()=>time});
        window.requestAnimationFrame=fn=>{frames.set(++next,fn);return next;};
        window.cancelAnimationFrame=id=>frames.delete(id);
        window.advanceScroll=ms=>{time+=ms;const pending=[...frames.values()];frames.clear();pending.forEach(fn=>fn(time));};
        localStorage.setItem('cifras_musicas_v1',JSON.stringify([{id:'speed-test',title:'Resumo de teste',key:'E',capo:'',blocos:Array.from({length:50},(_,i)=>({l:i?'Tudo o que tenho '+i:'Precioso Jesus',c:'E  A  E  (2x)'}))}]));
      });
      const page=await context.newPage(),errors=[];
      // The review-only Netlify toolbar is not part of the app and overlays stage controls.
      if(process.env.TEST_BASE_URL)await context.addInitScript(()=>{
        const observer=new MutationObserver(()=>document.querySelectorAll('[data-netlify-deploy-id]').forEach(node=>node.remove()));
        observer.observe(document,{childList:true,subtree:true});
      });
      page.on('pageerror',error=>errors.push(error.message));
      await page.route('**/api/**',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({enabled:false,provider:'local'})}));
      await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({status:200,body:''}));
      await page.goto(process.env.TEST_BASE_URL||`http://127.0.0.1:${server.address().port}/`);
      await page.getByText('Resumo de teste',{exact:true}).click();
      const normal=page.getByRole('group',{name:'Velocidade do auto-scroll',exact:true});
      const stage=page.getByRole('group',{name:'Velocidade do auto-scroll no palco',exact:true});
      const value=group=>group.locator('output').innerText();
      const plus=group=>group.getByRole('button',{name:'Aumentar velocidade do auto-scroll'});
      const minus=group=>group.getByRole('button',{name:'Diminuir velocidade do auto-scroll'});
      const checkColors=async()=>{
        assert.equal(await page.locator('.wa-block .letra-linha').first().evaluate(el=>getComputedStyle(el).color),'rgb(255, 255, 255)');
        assert.equal(await page.locator('.wa-block .chord-line').first().evaluate(el=>getComputedStyle(el).color),'rgb(232, 137, 107)');
        assert.match(await page.locator('.wa-block .chord-line').first().innerText(),/\(2x\)/);
      };
      await checkColors();
      const content=await page.locator('#detail-content').innerText();
      if(reference)assert.equal(content,reference);else reference=content;
      assert.equal(await value(normal),'1,00x');
      await plus(normal).click();assert.equal(await value(normal),'1,05x');
      await minus(normal).click();assert.equal(await value(normal),'1,00x');
      for(let i=0;i<7;i++)await minus(normal).click();
      assert.equal(await value(normal),'0,65x');
      await page.locator('#capo-opt-2').click();
      await page.locator('#btn-palco').click();
      assert.equal(await value(stage),'0,65x');
      assert.equal(await page.locator('#stage-capo-value').innerText(),'2');
      assert.equal(await page.locator('#modal-overlay').isVisible(),false);
      await page.getByRole('button',{name:'Sem capotraste',exact:true}).click();
      await checkColors();
      for(let i=0;i<5;i++)await minus(stage).click();
      assert.equal(await value(stage),'0,40x');assert.equal(await minus(stage).isEnabled(),false);
      await page.evaluate(()=>adjustStageScrollSpeed(-1));assert.equal(await value(stage),'0,40x');
      await page.evaluate(()=>document.getElementById('view-detail').scrollTop=0);
      const header=page.locator('#stage-performance-header'),headerBefore=await header.boundingBox();
      const score=await page.locator('#detail-content').boundingBox();
      assert.ok(score.y>=headerBefore.y+headerBefore.height,'score starts below the header');
      assert.equal(await page.locator('.stage-floating-controls').count(),0);
      assert.ok(await page.locator('#view-detail').evaluate(el=>el.scrollWidth<=el.clientWidth),'no horizontal overflow');
      for(const button of await header.locator('button').all()){
        const box=await button.boundingBox();if(!box)continue;
        assert.ok(box.x>=0&&box.x+box.width<=viewport.width,'header buttons fit viewport');
        assert.ok(box.height>=44&&box.width>=44,'touch target');
      }
      const originalKey=await page.locator('#stage-key').innerText();
      await header.getByRole('button',{name:'Subir o tom',exact:true}).click();
      assert.notEqual(await page.locator('#stage-key').innerText(),originalKey);
      await header.getByRole('button',{name:'Descer o tom',exact:true}).click();
      assert.equal(await page.locator('#stage-key').innerText(),originalKey);
      if(process.env.SCREENSHOT_DIR){fs.mkdirSync(process.env.SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR,`stage-${viewport.width}x${viewport.height}.png`)});}
      await page.evaluate(()=>{document.getElementById('view-detail').scrollTop=400;});
      await page.locator('#stage-scroll-toggle').click();
      const before=await page.evaluate(()=>document.getElementById('view-detail').scrollTop);
      await page.evaluate(()=>advanceScroll(100));
      assert.equal(await page.evaluate(()=>document.getElementById('view-detail').scrollTop),before+2);
      const timer=await page.evaluate(()=>scrollTimer);
      for(let i=0;i<32;i++)await plus(stage).click();
      assert.equal(await value(stage),'2,00x');assert.equal(await plus(stage).isEnabled(),false);
      await page.evaluate(()=>adjustStageScrollSpeed(1));assert.equal(await value(stage),'2,00x');
      assert.equal(await page.evaluate(()=>scrollTimer),timer,'speed change must not restart the loop');
      assert.equal(await page.evaluate(()=>document.getElementById('view-detail').scrollTop),before+2);
      await page.evaluate(()=>advanceScroll(100));
      assert.equal(await page.evaluate(()=>document.getElementById('view-detail').scrollTop),before+14);
      assert.deepEqual(await header.boundingBox(),headerBefore,'header stays still during scroll');
      assert.ok((await page.locator('#view-detail').boundingBox()).y>=headerBefore.height,'scroll viewport is below header');
      await page.locator('#stage-scroll-toggle').click();assert.equal(await page.evaluate(()=>scrollTimer),null);
      const bounds=await stage.boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=viewport.width);
      assert.ok((await plus(stage).boundingBox()).height>=44);
      await page.getByRole('button',{name:'Sair do Modo Palco',exact:true}).click();
      assert.equal(await value(normal),'2,00x');
      await page.reload();await page.getByText('Resumo de teste',{exact:true}).click();
      assert.equal(await value(normal),'2,00x');
      assert.deepEqual(errors,[]);await context.close();
    }
    console.log('summary-autoscroll-ui.test.js: OK (header fixo, sem sobreposição, cores, velocidade, transposição e capo em 6 viewports)');
  }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
