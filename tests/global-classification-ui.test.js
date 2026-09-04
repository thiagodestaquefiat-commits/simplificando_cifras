const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{
 const file=path.resolve(root,new URL(req.url,'http://localhost').pathname.slice(1)||'index.html');
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||fs.statSync(file).isDirectory())return res.writeHead(404).end();
 res.setHeader('Content-Type',path.extname(file)==='.js'?'application/javascript':path.extname(file)==='.html'?'text/html':'text/css');fs.createReadStream(file).pipe(res);
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{for(const viewport of [{width:390,height:844},{width:1366,height:768}]){
  const context=await browser.newContext({viewport,serviceWorkers:'block'}),page=await context.newPage();
  await page.route('**/api/**',route=>route.fulfill({status:200,contentType:'application/json',body:'{"enabled":false}'}));
  await page.goto(process.env.TEST_BASE_URL||`http://127.0.0.1:${server.address().port}/`);
  const results=await page.evaluate(async()=>{
   const fixtures=[
    {id:'legacy-colors',title:'Legada',key:'C',blocos:[{l:'F C 4x',c:'F C G 3x\nNosso amigo, Santo Espírito'}]},
    ...['manual','ai','imported'].map(source=>songFormat.toLegacy(songFormat.normalize({id:source,title:source,source,sections:[{label:'Refrão',lines:[{lyrics:'F C 3x',chords:[]},{lyrics:'O que dizer',chords:[{chord:'C#m7',position:0},{chord:'Bb',position:7}]}]}]}))),
    {id:'full',title:'Completa',key:'C',blocos:[{l:'Intro',c:'F C'}],fullChordSheet:{content:'F C G 3x\nAleluia\nIntro'}},
    {id:'full-structured',title:'Completa estruturada',key:'C',blocos:[{l:'Intro',c:'F C'}],fullChordSheet:{content:'F C 4x\nO sentimento',sections:[{nome:'Intro',linhas:[{letra:'F C 4x',acordes:[]},{letra:'O sentimento',acordes:[{acorde:'A9',posicao:0}]}]}]}}
   ];
   const before=JSON.stringify(fixtures);musicas.push(...fixtures);
   const values=[];
   for(const fixture of fixtures){
    openDetail(fixture.id);
    for(const stage of [false,true]){
     if(stage)await enterStageMode();
     const rows=[...document.querySelectorAll('#detail-content .chord-line,#detail-content .letra-linha,#detail-content .full-chord-line')].map(el=>({text:el.textContent.trim(),color:getComputedStyle(el).color})).filter(row=>row.text);
     values.push({id:fixture.id,stage,rows});
     if(stage)await exitStageMode();
    }
   }
   return {values,unchanged:before===JSON.stringify(fixtures)};
  });
  assert.equal(results.unchanged,true);
  for(const sample of results.values){
   assert.ok(sample.rows.length);
   for(const row of sample.rows){
    const musical=/^(?:[A-G][#b]?\S*(?:\s+|$))/.test(row.text)&&!['Aleluia','Intro','Refrão'].includes(row.text);
    assert.equal(row.color,musical?'rgb(232, 137, 107)':'rgb(255, 255, 255)',JSON.stringify(sample));
   }
  }
  await context.close();
 }console.log('global-classification-ui.test.js: OK (6 formats, normal/stage, mobile/desktop, no source mutation)');
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
