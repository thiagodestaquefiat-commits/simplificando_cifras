const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require(process.env.ROUDY_TEST_PLAYWRIGHT || "playwright");
const root = path.resolve(__dirname, "..");
const types = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png" };
const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, "http://localhost").pathname;
  const file = path.resolve(root, pathname === "/" ? "index.html" : decodeURIComponent(pathname.slice(1)));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return response.writeHead(404).end();
  response.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(response);
});
const center = (box) => box.x + box.width / 2;
(async () => {
  let browser;
  try {
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    browser = await chromium.launch({ headless: true, executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
    for (const viewport of [{ width: 320, height: 720 }, { width: 375, height: 812 }, { width: 390, height: 844 }, { width: 430, height: 932 }]) {
      const context = await browser.newContext({ viewport, serviceWorkers: "block" });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route("https://fonts.googleapis.com/**", (route) => route.fulfill({ contentType: "text/css", body: "" }));
      await page.route("**/api/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
      await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: "domcontentloaded" });
      await page.getByRole("button", { name: "Continuar sem login" }).click();
      await page.waitForFunction(() => typeof songFormat !== "undefined" && typeof musicas !== "undefined");
      await page.evaluate(() => {
        const makeSong = (id, title) => songFormat.toLegacy(songFormat.normalize({ id, title, artist: "ROUDY", originalKey: "G", sections: Array.from({ length: 50 }, (_, index) => ({ label: "Verso", lines: [{ chords: [{ chord: "G", position: 0 }, { chord: "C", position: 7 }], lyrics: `Linha musical ${index + 1}` }] })) }));
        musicas.push(makeSong("stage-iphone", "Palco no iPhone"), makeSong("stage-iphone-2", "Segunda música"));
        const songs=[musicas.at(-2),musicas.at(-1)];
        setlists.push(eventModel.create({ id: "stage-iphone-event", title: "Evento Palco", leaderId: appCurrentUser.id, members: [{ ...appCurrentUser, isLeader: true }], repertoire: songs.map((song,index)=>({id:`stage-item-${index}`,songId:song.id,shared:eventEditFromSong(eventSongCopy(song))})) }));
        openDetailFromEventItem("stage-iphone-event", "stage-item-0"); enterStageMode();
      });
      const header = page.locator("#stage-performance-header");
      await header.waitFor({ state: "visible" });
      const play = page.locator("#stage-scroll-pause");
      const minus = page.locator('.stage-execution-step[data-scroll-step="-1"]');
      const plus = page.locator('.stage-execution-step[data-scroll-step="1"]');
      assert.equal(await play.getAttribute('aria-label'),'Iniciar rolagem automática');
      assert.equal(await play.evaluate((element)=>element.classList.contains('is-initial')),true);
      const [playBox, minusBox, plusBox] = await Promise.all([play.boundingBox(), minus.boundingBox(), plus.boundingBox()]);
      for(const [label,box] of [["Play",playBox],["Diminuir velocidade",minusBox],["Aumentar velocidade",plusBox]])assert.ok(box,`${label} visível no estado inicial`);
      const output = process.env.SCREENSHOT_DIR;
      if (output) { fs.mkdirSync(output, { recursive: true }); await page.screenshot({ path: path.join(output, `stage-stopped-${viewport.width}x${viewport.height}.png`) }); }
      assert.ok(Math.abs(center(playBox) - viewport.width / 2) <= 1, "Play centralizado na viewport");
      const leftDistance = center(playBox) - center(minusBox), rightDistance = center(plusBox) - center(playBox);
      assert.ok(Math.abs(leftDistance - rightDistance) <= 1, `velocidade simétrica: ${leftDistance}/${rightDistance}`);
      const leftEdgeGap = playBox.x - (minusBox.x + minusBox.width), rightEdgeGap = plusBox.x - (playBox.x + playBox.width);
      assert.ok(leftEdgeGap >= 13 && leftEdgeGap <= 15, `espaço esquerdo aprovado entre bordas: ${leftEdgeGap}px`);
      assert.ok(rightEdgeGap >= 13 && rightEdgeGap <= 15, `espaço direito aprovado entre bordas: ${rightEdgeGap}px`);
      assert.ok(Math.abs(leftEdgeGap-rightEdgeGap)<=1,`espaçamento simétrico entre os controles: ${leftEdgeGap}/${rightEdgeGap}`);
      for (const name of ["Diminuir capotraste", "Aumentar capotraste", "Descer o tom", "Subir o tom"]) {
        const box = await header.getByRole("button", { name, exact: true }).boundingBox();
        assert.ok(box.width >= 44 && box.height >= 44, `${name}: alvo mínimo 44x44, obtido ${box.width}x${box.height}`);
      }
      const [capoMinus,capoValue,capoPlus]=await Promise.all([page.locator('#stage-capo-minus').boundingBox(),page.locator('#stage-capo-value').boundingBox(),page.locator('#stage-capo-plus').boundingBox()]);
      assert.ok(capoMinus&&capoValue&&capoPlus,'controle de capotraste completo e visível');
      const capoDoesNotOverlap=capoMinus.x+capoMinus.width<=capoValue.x&&capoValue.x+capoValue.width<=capoPlus.x;
      const capoIsCentered=Math.abs(center(capoValue)-(center(capoMinus)+center(capoPlus))/2)<=1;
      assert.equal(await page.locator("#stage-prev").isDisabled(), true, "anterior desativado na primeira música");
      await page.locator("#stage-next").click(); assert.equal(await page.evaluate(() => currentDetailId), "stage-iphone-2");
      assert.equal(await page.locator("#stage-next").isDisabled(), true, "próxima desativada na última música");
      await page.locator("#stage-prev").click(); assert.equal(await page.evaluate(() => currentDetailId), "stage-iphone");
      const capo = await page.locator("#stage-capo-value").innerText(); await page.locator("#stage-capo-plus").click(); assert.notEqual(await page.locator("#stage-capo-value").innerText(), capo); await page.locator("#stage-capo-minus").click();
      const key = await page.locator("#stage-key").innerText(); await header.getByRole("button", { name: "Subir o tom", exact: true }).click(); assert.notEqual(await page.locator("#stage-key").innerText(), key); await header.getByRole("button", { name: "Descer o tom", exact: true }).click();
      await page.evaluate(() => { scrollSpeed = 30; updateScrollSpeedControls(); });
      await play.click(); await page.waitForTimeout(120);
      const pause = page.locator("#stage-scroll-pause"), pauseBox = await pause.boundingBox();
      const runningMinus=page.locator('.stage-execution-step[data-scroll-step="-1"]'),runningPlus=page.locator('.stage-execution-step[data-scroll-step="1"]');
      const [runningMinusBox,runningPlusBox]=await Promise.all([runningMinus.boundingBox(),runningPlus.boundingBox()]);
      for(const [label,box] of [["Pause",pauseBox],["Diminuir em execução",runningMinusBox],["Aumentar em execução",runningPlusBox]])assert.ok(box,`${label} visível durante a rolagem`);
      assert.equal(await pause.getAttribute('aria-label'),'Pausar rolagem automática');
      if (output) await page.screenshot({ path: path.join(output, `stage-running-${viewport.width}x${viewport.height}.png`) });
      assert.ok(Math.abs(center(pauseBox) - viewport.width / 2) <= 1, "Pause centralizado na viewport");
      assert.ok(Math.abs(playBox.y-pauseBox.y)<=1,"Play e Pause mantêm a coordenada vertical");
      assert.ok(Math.abs(playBox.width-pauseBox.width)<=1&&Math.abs(playBox.height-pauseBox.height)<=1,"Play e Pause mantêm dimensões idênticas");
      assert.ok(Math.abs(minusBox.x-runningMinusBox.x)<=1&&Math.abs(minusBox.y-runningMinusBox.y)<=1,"controle esquerdo permanece imóvel");
      assert.ok(Math.abs(plusBox.x-runningPlusBox.x)<=1&&Math.abs(plusBox.y-runningPlusBox.y)<=1,"controle direito permanece imóvel");
      assert.ok(capoDoesNotOverlap,`valor do capotraste não se sobrepõe aos botões: ${JSON.stringify({capoMinus,capoValue,capoPlus})}`);
      assert.ok(capoIsCentered,'valor do capotraste centralizado entre − e +');
      assert.ok(await page.locator("#view-detail").evaluate((element) => element.scrollTop > 0), "rolagem iniciou");
      const speed = await page.evaluate(() => scrollSpeed); await page.locator('.stage-execution-step[data-scroll-step="1"]').click(); assert.equal(await page.evaluate(() => scrollSpeed), speed + 3, "velocidade responde ao botão"); assert.notEqual(await page.evaluate(() => scrollTimer), null, "ajuste mantém um loop ativo");
      await pause.click(); const stopped = await page.locator("#view-detail").evaluate((element) => element.scrollTop);
      await page.waitForTimeout(100); assert.equal(await page.locator("#view-detail").evaluate((element) => element.scrollTop), stopped, "pause preserva posição");
      assert.equal(await page.locator("#view-detail.stage-scroll-compact").count(), 0, "pause restaura os controles completos");
      assert.equal(await page.locator(".stage-capo-controls").isVisible(), true, "pause volta a mostrar tom e capotraste");
      await play.click(); await page.waitForTimeout(100); assert.ok(await page.locator("#view-detail").evaluate((element) => element.scrollTop) > stopped, "retomada continua da posição atual");
      await page.locator("#view-detail").evaluate((element) => { element.scrollTop = element.scrollHeight - element.clientHeight - 1; }); await page.waitForTimeout(120);
      assert.equal(await page.evaluate(() => scrollTimer), null, "rolagem encerra no fim"); assert.equal(await page.evaluate(() => currentDetailId), "stage-iphone", "fim não avança de música");
      assert.deepEqual(errors, []); await context.close();
    }
    console.log("stage-iphone-ui.test.js: OK");
  } finally { if (browser) await browser.close(); server.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
