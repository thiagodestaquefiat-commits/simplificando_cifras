const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

const projectRoot = path.resolve(__dirname, "..");
const executablePath = [process.env.BROWSER_EXECUTABLE,"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe","C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"].find((candidate)=>candidate&&fs.existsSync(candidate));
const server=http.createServer((request,response)=>{const pathname=new URL(request.url,"http://localhost").pathname;const relative=pathname==="/"?"index.html":decodeURIComponent(pathname.slice(1));const file=path.resolve(projectRoot,relative);if(!file.startsWith(projectRoot)||!fs.existsSync(file)||fs.statSync(file).isDirectory())return response.writeHead(404).end();const types={".html":"text/html; charset=utf-8",".js":"application/javascript; charset=utf-8",".css":"text/css; charset=utf-8",".json":"application/json; charset=utf-8",".webmanifest":"application/manifest+json; charset=utf-8",".png":"image/png"};response.writeHead(200,{"Content-Type":types[path.extname(file)]||"application/octet-stream"});fs.createReadStream(file).pipe(response);});

async function change(locator,value){await locator.fill(String(value));await locator.evaluate((element)=>element.dispatchEvent(new Event("change",{bubbles:true})));}

(async()=>{
  await new Promise((resolve)=>server.listen(0,"127.0.0.1",resolve));
  const browser=await chromium.launch({headless:true,executablePath});
  try{
    for(const viewport of [{width:390,height:844},{width:1366,height:768}]){
      const context=await browser.newContext({viewport});const page=await context.newPage();const errors=[];page.on("pageerror",(error)=>errors.push(error.message));page.on("console",(message)=>{if(message.type()==="error")errors.push(message.text());});await page.route("https://fonts.googleapis.com/**",(route)=>route.fulfill({status:200,contentType:"text/css",body:""}));
      await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:"domcontentloaded"});
      await page.getByText("Liberta-me de mim",{exact:true}).click();await page.getByRole("button",{name:"Editar cifra"}).click();
      assert.equal(await page.locator("#song-editor").isVisible(),true);assert.equal(await page.locator("#song-editor").evaluate((element)=>element.scrollWidth<=element.clientWidth),true);
      await change(page.getByLabel("Título"),"Liberta-me de mim revisada");await change(page.getByLabel("Artista"),"Artista teste");
      const chordInputs=page.locator(".se-chord-name");assert.ok(await chordInputs.count()>=4);await change(chordInputs.first(),"H7");assert.equal(await page.locator(".se-chord-name.se-invalid").count(),1);await change(page.locator(".se-chord-name.se-invalid"),"A9");
      await page.getByRole("button",{name:"+ Refrão"}).click();assert.ok(await page.locator(".se-section").count()>=2);const sections=page.locator(".se-section");const sectionCount=await sections.count();await sections.nth(sectionCount-1).getByRole("button",{name:"Duplicar"}).click();assert.equal(await page.locator(".se-section").count(),sectionCount+1);await page.locator(".se-section").nth(sectionCount).getByRole("button",{name:"↑"}).click();
      await page.getByRole("button",{name:"Desfazer"}).click();await page.getByRole("button",{name:"Refazer"}).click();
      await page.getByRole("button",{name:"Visualizar",exact:true}).click();assert.ok(await page.locator(".se-diagram").count()>=4);await page.getByRole("button",{name:"Resumo",exact:true}).click();assert.ok(await page.locator(".se-summary-row").count()>=1);await page.getByRole("button",{name:"Editar",exact:true}).click();
      for(const instrument of ["guitar","ukulele","keyboard","cavaquinho","viola-caipira-cebolao-e"]){await page.getByLabel("Instrumento").selectOption(instrument);await page.getByLabel("Instrumento").evaluate((element)=>element.dispatchEvent(new Event("change",{bubbles:true})));await page.getByRole("button",{name:"Visualizar",exact:true}).click();assert.equal(await page.locator(".se-diagram .se-error").count(),0,instrument);await page.getByRole("button",{name:"Editar",exact:true}).click();}
      await page.getByRole("button",{name:"Salvar rascunho"}).click();const drafts=await page.evaluate(()=>JSON.parse(localStorage.getItem("sc_song_editor_drafts_v1")));assert.ok(drafts&&Object.keys(drafts).length===1);
      await change(page.getByLabel("Observações"),"<img src=x onerror=alert(1)>");page.once("dialog",(dialog)=>dialog.accept());await page.getByRole("button",{name:"Salvar música"}).click();assert.equal(await page.locator("#song-editor").count(),0);const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem("cifras_musicas_v1")));const edited=stored.find((song)=>song.id===45);assert.equal(edited.title,"Liberta-me de mim revisada");assert.doesNotMatch(edited.notes,/[<>]/);assert.equal(edited.songFormatVersion,3);
      await page.getByRole("button",{name:"Editar cifra"}).click();await change(page.getByLabel("Título"),"Alteração não salva");
      page.once("dialog",(dialog)=>dialog.dismiss());await page.getByRole("button",{name:"Cancelar edição"}).click();assert.equal(await page.locator("#song-editor").isVisible(),true);
      page.once("dialog",(dialog)=>dialog.accept());await page.getByRole("button",{name:"Cancelar edição"}).click();assert.equal(await page.locator("#song-editor").count(),0);
      assert.equal(errors.length,0,errors.join(" | "));await context.close();
    }
    console.log("song-editor-ui.test.js: OK (mobile, desktop, edição, preview, resumo, persistência e segurança)");
  }finally{await browser.close();server.close();}
})().catch((error)=>{console.error(error);process.exitCode=1;});
