const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const executablePath = [process.env.BROWSER_EXECUTABLE, "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"].find((candidate) => candidate && fs.existsSync(candidate));
const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, "http://localhost").pathname;
  const relative = pathname === "/" ? "index.html" : decodeURIComponent(pathname.slice(1));
  const file = path.resolve(root, relative);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return response.writeHead(404).end();
  const type = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png" }[path.extname(file)] || "application/octet-stream";
  response.writeHead(200, { "Content-Type": type }); fs.createReadStream(file).pipe(response);
});

const response = {
  schemaVersion: 2,
  titulo: "Canção privada",
  artista: "Equipe",
  tom: "C",
  confianca: "media",
  observacoes: ["Revisar antes de salvar."],
  harmonicSummary: { blocos: [{ secao: "Refrão", acordes: ["C", "G", "Am", "F"], fraseGuia: "Frase curta do refrão", repeticoes: 2 }] },
  fullChordSheet: {
    visibility: "private",
    source: "user_upload",
    content: "INTRO\nC  G  Am  F\nPrimeira linha completa fornecida pelo usuário\nSegunda linha completa fornecida pelo usuário\n\nREFRÃO\nC  G  Am  F\nFrase curta do refrão",
    sections: [
      { nome: "Introdução", linhas: [{ letra: "Primeira linha completa fornecida pelo usuário", acordes: [{ acorde: "C", posicao: 0 }, { acorde: "G", posicao: 3 }, { acorde: "Am", posicao: 7 }, { acorde: "F", posicao: 11 }] }, { letra: "Segunda linha completa fornecida pelo usuário", acordes: [] }] },
      { nome: "Refrão", linhas: [{ letra: "Frase curta do refrão", acordes: [{ acorde: "C", posicao: 0 }, { acorde: "G", posicao: 3 }, { acorde: "Am", posicao: 7 }, { acorde: "F", posicao: 11 }] }] }
    ]
  }
};

(async () => {
  const previewUrl = process.env.PREVIEW_BASE_URL;
  if (!previewUrl) await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({ headless: true, executablePath });
  try {
    const snapshots = [];
    for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1366, height: 768 }]) {
      const context = await browser.newContext({ viewport, serviceWorkers: "block" });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
      page.on("requestfailed", (request) => errors.push(`${request.failure()?.errorText || "request failed"}: ${request.url()}`));
      await page.route("https://fonts.googleapis.com/**", (route) => route.fulfill({ status: 200, contentType: "text/css", body: "" }));
      await page.route("https://fonts.gstatic.com/**", (route) => route.fulfill({ status: 200, contentType: "font/woff2", body: Buffer.alloc(0) }));
      await page.route("https://sdk.scdn.co/**", (route) => route.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
      await page.route("https://cdn.segment.com/**", (route) => route.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
      await page.route("https://example.test/**", (route) => route.fulfill({ status: 200, contentType: "image/png", body: Buffer.alloc(0) }));
      await page.route('**/api/auth/config',route=>route.fulfill({json:{enabled:false}}));
      await page.goto(previewUrl || `http://127.0.0.1:${server.address().port}/`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(()=>loginGateAuthReady);
      await page.evaluate(()=>continueWithoutLogin());
      await page.evaluate((raw) => {
        const model = harmonicSummaryClient.responseToEditorModel(raw, "guitar");
        const song = songModel.create({
          ...songFormat.toLegacy(model), id: "private-song", spotifyTrackId: "track-private",
          spotifyUri: "spotify:track:track-private", album: "Álbum", coverUrl: "https://example.test/capa.jpg",
          isrc: "BRABC1234567", duration: 240000,
          accessContext: { scope: "team", ownerId: "user-1", teamId: "team-1" }
        });
        musicas.push(song); setlists.push({ id: "event-private", title: "Evento", musicas: [song.id] }); openDetail(song.id);
      }, response);

      assert.equal(await page.getByRole("button", { name: "Página 2 de 4 — Letra e cifra", exact: true }).getAttribute("aria-current"), "page");
      assert.equal(await page.locator('.song-page[data-page-index="1"]').getByText("Primeira linha completa fornecida pelo usuário", { exact: true }).count(), 1);
      if(viewport.width===390){
        const swipe=async(direction)=>{await page.evaluate((value)=>{const content=document.getElementById('detail-content'),from=value==='left'?310:80,to=value==='left'?70:320,y=Math.min(innerHeight-90,content.getBoundingClientRect().top+90),fire=(type,x)=>content.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerId:41,pointerType:'touch',clientX:x,clientY:y,buttons:type==='pointerup'?0:1}));fire('pointerdown',from);fire('pointermove',to);fire('pointerup',to);},direction);await page.waitForTimeout(260)};
        await swipe('left');assert.equal(await page.evaluate(()=>currentSongPage),2);
        await swipe('left');assert.equal(await page.evaluate(()=>currentSongPage),3);
        await swipe('left');assert.equal(await page.evaluate(()=>currentSongPage),3,'não deve haver wrap na última página');
        await swipe('right');assert.equal(await page.evaluate(()=>currentSongPage),2);
        await swipe('right');assert.equal(await page.evaluate(()=>currentSongPage),1);
        await swipe('right');assert.equal(await page.evaluate(()=>currentSongPage),0);
        await swipe('right');assert.equal(await page.evaluate(()=>currentSongPage),0,'não deve haver wrap na primeira página');
        await page.getByRole("button", { name: "Página 2 de 4 — Letra e cifra", exact: true }).click();
      }
      await page.getByRole("button", { name: "Página 1 de 4 — Resumo harmônico", exact: true }).click();
      const summary = await page.locator('.song-page[data-page-index="0"] .wa-block').innerText();
      assert.match(summary, /C\s+G\s+Am\s+F \(2x\)/);
      assert.match(summary, /Frase curta do refrão/);

      await page.getByRole("button", { name: "Página 2 de 4 — Letra e cifra", exact: true }).click();
      assert.equal(await page.locator('.song-page[data-page-index="1"]').getByText("Primeira linha completa fornecida pelo usuário", { exact: true }).count(), 1);
      const fullBefore = await page.locator('.song-page[data-page-index="1"] .full-chord-sheet').innerText();
      await page.evaluate(() => transpose(1));
      assert.match(await page.locator(".full-chord-sheet .is-chord").first().innerText(), /Db\s+Ab\s+Bbm\s+Gb/);
      await page.evaluate(() => {stagePreferences.save(appCurrentUser.id,{...stagePreferences.load(appCurrentUser.id),sheetView:'full'});enterStageMode();});
      assert.equal(await page.getByText("Configurar Modo Palco", { exact: true }).count(), 0);
      assert.equal(await page.getByText("Primeira linha completa fornecida pelo usuário", { exact: true }).count(), 1);
      assert.match(await page.locator("#detail-content .full-chord-sheet").innerText(), /Db\s+Ab\s+Bbm\s+Gb/);
      await page.getByRole("button", { name: "Sair do Modo Palco", exact: true }).click();

      await page.evaluate(() => editMusica("private-song"));
      assert.equal(await page.getByLabel("Cifra / Resumo", { exact: true }).count(), 1);
      const editorModal = page.locator("#modal-body");
      await editorModal.getByRole("tab", { name: "Letra + Cifras", exact: true }).click();
      assert.equal(await page.getByLabel("Letra + Cifras", { exact: true }).inputValue(), response.fullChordSheet.content);
      await page.getByLabel("Letra + Cifras", { exact: true }).fill(response.fullChordSheet.content + "\nFINAL\nC");
      await page.getByRole("button", { name: "Salvar", exact: true }).click();
      const saved = await page.evaluate(() => ({ song: musicas.find((item) => item.id === "private-song"), referenced: setlists[0].musicas.includes("private-song") }));
      assert.equal(saved.song.spotifyTrackId, "track-private");
      assert.equal(saved.song.spotifyUri, "spotify:track:track-private");
      assert.equal(saved.song.album, "Álbum");
      assert.equal(saved.song.coverUrl, "https://example.test/capa.jpg");
      assert.equal(saved.song.isrc, "BRABC1234567");
      assert.equal(saved.song.duration, 240000);
      assert.equal(saved.song.fullChordSheet.visibility, "private");
      assert.deepEqual(saved.song.accessContext, { scope: "team", ownerId: "user-1", teamId: "team-1" });
      assert.match(saved.song.fullChordSheet.content, /FINAL\nC$/);
      assert.equal(saved.song.fullChordSheet.sections.length, 0, "editar o texto invalida posições estruturadas antigas");
      assert.equal(saved.referenced, true);

      snapshots.push({ summary, fullBefore });
      assert.equal(errors.length, 0, errors.join(" | "));
      await context.close();
    }
    assert.deepEqual(snapshots[1], snapshots[0]);
    assert.deepEqual(snapshots[2], snapshots[0]);
    console.log("full-chord-sheet-ui.test.js: OK (privacidade, seletor, editor simples, palco, transposição, Spotify e 3 viewports)");
  } finally { await browser.close(); if (!previewUrl) server.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
