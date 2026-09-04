const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const browserExecutable = [
  process.env.BROWSER_EXECUTABLE,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
].find((candidate) => candidate && fs.existsSync(candidate));

const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, "http://localhost").pathname;
  const relative = pathname === "/" ? "index.html" : decodeURIComponent(pathname.slice(1));
  const file = path.resolve(root, relative);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return response.writeHead(404).end();
  const type = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".json": "application/json", ".webmanifest": "application/manifest+json" }[path.extname(file)] || "application/octet-stream";
  response.writeHead(200, { "Content-Type": type });
  fs.createReadStream(file).pipe(response);
});

async function verifyViewport(browser, baseUrl, viewport) {
  const context = await browser.newContext({ viewport, serviceWorkers: "block" });
  await context.addInitScript(() => {
    sessionStorage.setItem("sc_spotify_auth_v1", JSON.stringify({ tokens: { accessToken: "test", refreshToken: "test", expiresAt: Date.now() + 3600000 } }));
  });
  const page = await context.newPage();
  await page.route("https://fonts.googleapis.com/**", (route) => route.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await page.route("https://sdk.scdn.co/**", (route) => route.abort());
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    const song = musicas[0];
    song.spotifyUri = "spotify:track:test";
    song.spotifyTrackId = "test";
    song.duration = 240000;
    song.blocos = Array.from({ length: 32 }, (_, index) => ({ l: `Trecho ${index + 1}`, c: "G D Em C\nLinha musical para validar a rolagem até o final." }));
    openDetail(song.id);
  });
  const player = page.locator("#spotify-song-player.is-linked");
  await player.waitFor({ state: "visible" });
  const layout = await page.evaluate(() => {
    const player = document.getElementById("spotify-song-player");
    const detail = document.getElementById("view-detail");
    const style = getComputedStyle(player);
    return {
      parentIsBody: player.parentElement === document.body,
      position: style.position,
      bottom: style.bottom,
      zIndex: Number(style.zIndex),
      reserved: parseFloat(getComputedStyle(detail).paddingBottom),
      playerHeight: player.getBoundingClientRect().height,
      detailMarked: detail.classList.contains("has-global-player")
    };
  });
  assert.equal(layout.parentIsBody, true);
  assert.equal(layout.position, "fixed");
  assert.equal(layout.bottom, "0px");
  assert.ok(layout.zIndex > 10 && layout.zIndex < 80);
  assert.equal(layout.detailMarked, true);
  assert.ok(layout.reserved > layout.playerHeight);
  assert.equal(await page.locator(".song-player-mini-cover").count(), 1);
  assert.equal(await page.locator(".song-player-mini-info strong").innerText(), "A alegria");
  assert.equal(await page.locator(".song-player-mini-play").count(), 1);
  assert.equal(await page.getByRole("button", { name: "Voltar 15 segundos" }).count(), 1);
  assert.equal(await page.getByRole("button", { name: "Avançar 15 segundos" }).count(), 1);
  assert.equal(await page.locator("#song-player-mini-timeline").count(), 1);

  const scrollStability = await page.locator("#view-detail").evaluate((detail) => {
    detail.scrollTop = Math.round(detail.scrollHeight * 0.4);
    return detail.scrollTop;
  });
  const playerTop = await player.evaluate((element) => element.getBoundingClientRect().top);
  await page.waitForTimeout(650);
  assert.ok(Math.abs(await page.locator("#view-detail").evaluate((detail) => detail.scrollTop) - scrollStability) <= 1);
  assert.ok(Math.abs(await player.evaluate((element) => element.getBoundingClientRect().top) - playerTop) <= 1);

  await page.locator("#view-detail").evaluate((detail) => { detail.scrollTop = detail.scrollHeight; });
  await page.waitForTimeout(50);
  const overlap = await page.evaluate(() => {
    const last = [...document.querySelectorAll("#detail-content .wa-block")].at(-1).getBoundingClientRect();
    const player = document.getElementById("spotify-song-player").getBoundingClientRect();
    return last.bottom - player.top;
  });
  assert.ok(overlap <= 0, `último trecho ficou ${overlap}px atrás do player`);

  await page.getByRole("button", { name: /Abrir player de/ }).click();
  const expandedPlayer = page.getByRole("dialog", { name: /Player de/ });
  await expandedPlayer.waitFor({ state: "visible" });
  assert.equal(await expandedPlayer.getByRole("button", { name: "Voltar 15 segundos" }).count(), 1);
  assert.equal(await expandedPlayer.getByRole("button", { name: "Avançar 15 segundos" }).count(), 1);
  assert.equal(await page.locator("#song-player-progress").count(), 1);
  await page.getByRole("button", { name: "Reduzir player" }).click();

  await page.evaluate(() => closeDetail());
  const hidden = await page.evaluate(() => ({
    inline: document.getElementById("spotify-song-player").previousElementSibling?.id === "spotify-song-player-anchor",
    empty: document.getElementById("spotify-song-player").childElementCount === 0,
    reserved: document.getElementById("view-detail").classList.contains("has-global-player")
  }));
  assert.deepEqual(hidden, { inline: true, empty: true, reserved: false });
  await context.close();
}

(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch({ headless: true, executablePath: browserExecutable });
  try {
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 844, height: 390 },
      { width: 768, height: 1024 },
      { width: 1024, height: 768 },
      { width: 1366, height: 768 }
    ]) await verifyViewport(browser, baseUrl, viewport);
    const source = fs.readFileSync(path.join(root, "index.html"), "utf8");
    assert.match(source, /env\(safe-area-inset-bottom\)/);
    console.log("spotify-mini-player-ui.test.js: OK (rodapé global, scroll estável, sem sobreposição, controles, mobile/tablet/desktop portrait e landscape)");
  } finally {
    await browser.close();
    server.close();
  }
})().catch((error) => {
  console.error(error);
  server.close();
  process.exitCode = 1;
});
