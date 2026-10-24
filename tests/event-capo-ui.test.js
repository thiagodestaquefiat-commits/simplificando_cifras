const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const assert=require('node:assert/strict');
const {chromium}=require(process.env.ROUDY_TEST_PLAYWRIGHT||'playwright');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{const url=decodeURIComponent(req.url.split('?')[0]);const file=path.join(process.cwd(),url==='/'?'index.html':url);fs.readFile(file,(error,data)=>{if(error){res.writeHead(404);res.end();return;}res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});res.end(data);});});

(async()=>{let browser;try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  browser=await chromium.launch({headless:true,...(process.env.ROUDY_CHROME?{executablePath:process.env.ROUDY_CHROME}:{})});
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const errors=[];page.on('pageerror',error=>errors.push(String(error)));
  await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>typeof continueWithoutLogin==='function').catch(()=>{});
  await page.evaluate(()=>{try{continueWithoutLogin();}catch(error){}const song={id:'t1',title:'Canção de Simeão',artist:'X',key:'A',blocos:[{l:'Verso',c:'A D E F#m'}]};musicas.push(song);const date=new Date();setlists.push(eventModel.create({id:'ev',title:'Culto',date:date.toISOString().slice(0,10),leaderId:appCurrentUser.id,members:[{...appCurrentUser,isLeader:true}],repertoire:[{id:'it',songId:'t1',shared:eventEditFromSong(eventSongCopy(song))}]}));openDetailFromEventItem('ev','it');});
  await page.waitForTimeout(800);
  const read=()=>page.evaluate(()=>({tom:document.getElementById('song-control-key').textContent,badge:document.getElementById('detail-key').textContent,capo:selectedCapo,semitones:currentSemitones,acordes:[...document.querySelectorAll('#chord-strip .chord-card-name, #chord-strip [class*=name]')].map(element=>element.textContent.trim()).filter(Boolean).slice(0,4).join(' ')}));
  const step=async(fn,arg)=>{await page.evaluate(fn,arg);await page.waitForTimeout(1200);return read();};
  assert.deepEqual(await read(),{tom:'A',badge:'Tom: A',capo:0,semitones:0,acordes:'A D E F#m'});
  for(const capo of [1,2,3]){const state=await step(value=>selectCapo(value),capo);assert.equal(state.tom,'A','capo não muda o tom');assert.equal(state.semitones,0,'capo não cria transposição acumulada');}
  let state=await step(()=>selectCapo(0));assert.equal(state.tom,'A');assert.equal(state.acordes.split(' ').slice(0,3).join(' '),'A D E','tirar o capo volta aos acordes do tom');
  state=await step(()=>transpose(1));assert.equal(state.tom,'Bb');
  state=await step(value=>selectCapo(value),1);assert.equal(state.tom,'Bb','capo depois de mudar o tom não sobe o tom');assert.equal(state.acordes.split(' ').slice(0,3).join(' '),'A D E');
  state=await step(value=>selectCapo(value),2);assert.equal(state.tom,'Bb');
  assert.deepEqual(errors,[]);console.log('event-capo-ui.test.js: OK (capo no evento muda só os acordes, sem dupla transposição)');
}finally{if(browser)await browser.close();server.close();}})().catch(error=>{console.error(error);process.exitCode=1});
