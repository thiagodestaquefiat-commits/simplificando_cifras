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
    body: `window.YT={Player:function(id,options){var old=document.getElementById(id);var frame=document.createElement('iframe');frame.id=id;frame.className=old.className;frame.title='YouTube video player';old.replaceWith(frame);this.destroy=function(){frame.remove()};this.pauseVideo=function(){};setTimeout(()=>options.events.onReady({target:this}),0);}};window.onYouTubeIframeAPIReady();`
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
    assert.equal(await player.evaluate((node) => getComputedStyle(node).position), "sticky");
    assert.equal(await page.getByRole("button", { name: "Abrir vídeo de Bondade de Deus" }).count(), 1);

    await page.getByRole("button", { name: "Abrir vídeo de Bondade de Deus" }).click();
    await page.locator("#youtube-iframe-player").waitFor({ state: "visible" });
    const dimensions = await page.locator("#youtube-iframe-player").evaluate((node) => ({ width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height }));
    assert.ok(dimensions.width >= 200 && dimensions.height >= 200, JSON.stringify(dimensions));
    const topBefore = await player.evaluate((node) => node.getBoundingClientRect().top);
    await page.locator("#view-detail").evaluate((node) => { node.scrollTop = 700; });
    await page.waitForTimeout(50);
    const topAfter = await player.evaluate((node) => node.getBoundingClientRect().top);
    assert.ok(Math.abs(topBefore - topAfter) <= 2, `${topBefore} != ${topAfter}`);

    await page.getByRole("button", { name: "Recolher vídeo" }).click();
    assert.equal(await page.locator("#youtube-iframe-player").count(), 0, "o iframe deve ser removido ao recolher");
    assert.equal(await page.getByRole("button", { name: "Abrir vídeo de Bondade de Deus" }).count(), 1);
    console.log("youtube-player-ui.test.js: OK (miniatura, player oficial visível, sticky e recolhimento seguro)");
  } finally {
    await context.close();
    await browser.close();
    server.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
