const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

const projectRoot = path.resolve(__dirname, "..");
const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, "http://localhost").pathname;
  const relativePath = pathname === "/" ? "index.html" : decodeURIComponent(pathname.slice(1));
  const filePath = path.resolve(projectRoot, relativePath);
  if (!filePath.startsWith(projectRoot) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    response.writeHead(404).end("Not found");
    return;
  }
  const types = { ".html": "text/html; charset=utf-8", ".js": "application/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".webmanifest": "application/manifest+json" };
  response.writeHead(200, { "Content-Type": types[path.extname(filePath)] || "application/octet-stream" });
  fs.createReadStream(filePath).pipe(response);
});

(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const executablePath = [process.env.BROWSER_EXECUTABLE, "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"].find((candidate) => candidate && fs.existsSync(candidate));
  const browser = await chromium.launch({ headless: true, executablePath });
  const context = await browser.newContext({ viewport: { width: 390, height: 760 } });
  const blocks = Array.from({ length: 16 }, (_, index) => ({ l: `Parte ${index + 1}`, c: "C G Am F\nTrecho para testar a rolagem do conteúdo" }));
  await context.addInitScript(({ blocks }) => {
    const songs = [{ id: "youtube-song", title: "Bondade de Deus", artist: "Isaias Saad", key: "D", capo: "", blocos: blocks, youtubeVideoId: "video-123", youtubeUrl: "https://www.youtube.com/watch?v=video-123", youtubeChannelTitle: "Isaias Saad", coverUrl: "https://i.ytimg.com/vi/video-123/hqdefault.jpg" }];
    localStorage.setItem("sc_songs_v1", JSON.stringify(songs));
    localStorage.setItem("cifras_musicas_v1", JSON.stringify(songs));
  }, { blocks });
  const page = await context.newPage();
  await page.route("https://fonts.googleapis.com/**", (route) => route.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await page.route("**/api/auth/config", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ enabled: false, provider: "local" }) }));
  await page.route("**/api/youtube/search**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ provider: "youtube", videos: [{ videoId: "result-1", title: "Bondade de Deus (Oficial)", channelTitle: "Isaias Saad", thumbnailUrl: "https://i.ytimg.com/vi/result-1/hqdefault.jpg", youtubeUrl: "https://www.youtube.com/watch?v=result-1", publishedAt: null }] })
  }));
  await page.route("https://www.youtube.com/iframe_api", (route) => route.fulfill({
    status: 200,
    contentType: "application/javascript",
    body: `window.YT={Player:function(id,options){var old=document.getElementById(id);var frame=document.createElement('iframe');var current=32,state=1,seekCount=0;frame.id=id;frame.className=old.className;frame.title='YouTube video player';old.replaceWith(frame);window.__ytTest={setTime:function(value){current=value},getSeekCount:function(){return seekCount}};this.destroy=function(){frame.remove()};this.pauseVideo=function(){state=2;options.events.onStateChange({data:2,target:this})};this.playVideo=function(){state=1;options.events.onStateChange({data:1,target:this})};this.getPlayerState=function(){return state};this.getDuration=function(){return 240};this.getCurrentTime=function(){return current};this.seekTo=function(value){current=value;seekCount++};setTimeout(()=>options.events.onReady({target:this}),0);}};window.onYouTubeIframeAPIReady();`
  }));

  try {
    await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: "domcontentloaded" });
    assert.equal(await page.locator(".spotify-panel").count(), 0, "a busca Spotify deve permanecer oculta");
    assert.equal(await page.locator(".youtube-panel").count(), 1, "a busca YouTube deve substituir a busca Spotify");
    await page.locator("#youtube-input").fill("Bondade");
    await page.locator(".youtube-video-result").waitFor({ state: "visible" });
    assert.match(await page.locator(".youtube-video-result").innerText(), /Bondade de Deus/);
    await page.locator("#youtube-input").fill("");
    await page.getByText("Bondade de Deus", { exact: true }).click();
    const player = page.locator("#youtube-song-player");
    await player.waitFor({ state: "visible" });
    const diagramScale = await page.locator(".chord-card svg").first().evaluate((svg) => Number(svg.getAttribute("width")) / svg.viewBox.baseVal.width);
    assert.ok(Math.abs(diagramScale - .65) < .01, `escala esperada 65%, recebida ${diagramScale}`);
    assert.equal(await page.locator(".chord-card").first().evaluate((node) => getComputedStyle(node).borderStyle), "none", "os diagramas não devem usar cartões contornados");
    assert.equal(await player.evaluate((node) => getComputedStyle(node).position), "sticky");
    assert.equal(await page.getByRole("button", { name: "Abrir vídeo de Bondade de Deus" }).count(), 1);

    await page.getByRole("button", { name: "Abrir vídeo de Bondade de Deus" }).click();
    await page.locator("#youtube-iframe-player").waitFor({ state: "visible" });
    const changeButton = page.getByRole("button", { name: "Escolher outro vídeo" });
    assert.match(await changeButton.innerText(), /Trocar vídeo/);
    assert.equal(await changeButton.evaluate((node) => node.parentElement?.classList.contains("youtube-player-actions")), true, "o botão de troca deve ficar no menu retrátil");
    assert.equal(await page.locator(".youtube-player-bar").count(), 0, "o cabeçalho acima do vídeo deve ser removido");
    assert.equal(await page.locator(".youtube-player-status").evaluate((node) => node.classList.contains("is-visually-hidden")), true, "o status deve permanecer apenas para leitores de tela");
    const actions = page.locator(".youtube-player-actions");
    assert.equal(await actions.evaluate((node) => node.classList.contains("is-visible")), true, "as opções devem aparecer ao abrir o vídeo");
    assert.equal(await page.getByRole("button", { name: "Selecionar trecho para repetir" }).count(), 0);
    assert.equal(await page.getByRole("button", { name: "Repetir trecho" }).count(), 1);
    assert.equal(await page.getByRole("button", { name: "Ativar miniplayer flutuante" }).count(), 1);
    assert.equal(await page.getByRole("button", { name: "Fechar player" }).count(), 1);
    await page.waitForTimeout(4650);
    assert.equal(await actions.evaluate((node) => node.classList.contains("is-visible")), false, "as opções devem recolher automaticamente após 4,5 segundos");
    const frameBox = await page.locator("#youtube-iframe-player").boundingBox();
    await page.mouse.click(frameBox.x + frameBox.width / 2, frameBox.y + frameBox.height / 2);
    await page.waitForTimeout(50);
    assert.equal(await actions.evaluate((node) => node.classList.contains("is-visible")), true, "clicar no vídeo deve reabrir imediatamente as opções");
    const dimensions = await page.locator("#youtube-iframe-player").evaluate((node) => ({ width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height }));
    assert.ok(dimensions.width >= 200 && dimensions.height >= 200, JSON.stringify(dimensions));
    const topBefore = await player.evaluate((node) => node.getBoundingClientRect().top);
    await page.locator("#view-detail").evaluate((node) => { node.scrollTop = 700; });
    await page.waitForTimeout(50);
    const topAfter = await player.evaluate((node) => node.getBoundingClientRect().top);
    assert.ok(Math.abs(topBefore - topAfter) <= 2, `${topBefore} != ${topAfter}`);

    await page.getByRole("button", { name: "Repetir trecho" }).click();
    const repeatPanel = page.getByRole("dialog", { name: "Selecionar trecho para repetir" });
    await repeatPanel.waitFor({ state: "visible" });
    const sliders = repeatPanel.locator("input[type=range]");
    await sliders.nth(0).evaluate((node) => { node.value = "45"; node.dispatchEvent(new Event("input", { bubbles: true })); });
    await sliders.nth(1).evaluate((node) => { node.value = "60"; node.dispatchEvent(new Event("input", { bubbles: true })); });
    await page.waitForTimeout(4650);
    assert.equal(await actions.evaluate((node) => node.classList.contains("is-visible")), true, "o menu deve permanecer visível enquanto o seletor de trecho estiver aberto");
    await page.getByRole("button", { name: "Ativar repetição do trecho" }).click();
    assert.equal(await repeatPanel.isVisible(), true, "o seletor deve continuar visível após ativar a repetição");
    await page.evaluate(() => window.__ytTest.setTime(61));
    await page.waitForTimeout(180);
    const firstReturn = await page.evaluate(() => window.__ytTest.getSeekCount());
    await page.evaluate(() => window.__ytTest.setTime(61));
    await page.waitForTimeout(180);
    const secondReturn = await page.evaluate(() => window.__ytTest.getSeekCount());
    assert.ok(secondReturn > firstReturn, "o trecho deve voltar ao início em todas as repetições");
    await page.getByRole("button", { name: "Repetir trecho" }).click();
    assert.equal(await page.evaluate(() => window.youtubePlayer.getSegmentLoop()), null, "o segundo clique deve desativar a repetição");
    await page.getByRole("button", { name: "Ativar miniplayer flutuante" }).click();
    assert.equal(await player.evaluate((node) => node.classList.contains("is-floating")), true, "o player deve entrar no modo flutuante");
    const floatingDimensions = await page.locator("#youtube-iframe-player").evaluate((node) => ({ width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height }));
    assert.ok(floatingDimensions.width >= 200 && floatingDimensions.height >= 200, JSON.stringify(floatingDimensions));
    const bar = page.locator(".youtube-player-floating-grip");
    const beforeDrag = await player.boundingBox();
    const barBox = await bar.boundingBox();
    await page.mouse.move(barBox.x + 20, barBox.y + 20);
    await page.mouse.down();
    await page.mouse.move(barBox.x + 5, barBox.y + 70, { steps: 3 });
    await page.mouse.up();
    const afterDrag = await player.boundingBox();
    assert.notEqual(Math.round(afterDrag.y), Math.round(beforeDrag.y), "o miniplayer deve poder ser arrastado");

    await page.getByRole("button", { name: "Fechar player" }).click();
    assert.equal(await page.locator("#youtube-iframe-player").count(), 0, "o iframe deve ser removido ao recolher");
    assert.equal(await page.getByRole("button", { name: "Abrir vídeo de Bondade de Deus" }).count(), 1);
    console.log("youtube-player-ui.test.js: OK (menu retrátil, repetição A-B, miniplayer arrastável e fechamento seguro)");
  } finally {
    await context.close();
    await browser.close();
    server.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
