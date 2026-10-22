const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require(process.env.ROUDY_TEST_PLAYWRIGHT || "playwright");

const root = path.resolve(__dirname, "..");
const artifacts = path.join(root, "artifacts");
const types = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml" };
const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, "http://localhost").pathname;
  const file = path.resolve(root, pathname === "/" ? "index.html" : decodeURIComponent(pathname.slice(1)));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return response.writeHead(404).end();
  response.writeHead(200, { "Content-Type": `${types[path.extname(file)] || "application/octet-stream"}; charset=utf-8` });
  fs.createReadStream(file).pipe(response);
});

(async () => {
  let browser;
  try {
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    fs.mkdirSync(artifacts, { recursive: true });
    browser = await chromium.launch({ headless: true, executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, serviceWorkers: "block" });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("https://fonts.googleapis.com/**", (route) => route.fulfill({ contentType: "text/css", body: "" }));
    await page.route("**/api/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
    await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Continuar sem login" }).click();
    await page.waitForFunction(() => window.homePlaylists && window.songArtwork && typeof musicas !== "undefined" && Array.isArray(musicas));

    const playlistIds = await page.evaluate(() => {
      const colors = ["0789E7", "D6A83A", "31C98B", "F06464", "8B5CF6", "F97316"];
      const sourceSongs = Array.from({ length: 6 }, (_, index) => songModel.create({ id: `artwork-test-${index}`, title: `Capa teste ${index + 1}`, artist: `Artista ${index + 1}`, blocos: [] }));
      musicas.push(...sourceSongs);
      sourceSongs.forEach((song, index) => {
        song.artworkUrl = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Crect width='100' height='100' fill='%23${colors[index]}'/%3E%3C/svg%3E`;
        song.artworkSource = index === 0 ? "spotify" : "imported";
        song.youtubeThumbnailUrl = index === 0 ? "https://i.ytimg.com/vi/own-video/hqdefault.jpg" : null;
      });
      sourceSongs[5].artworkUrl = null;
      sourceSongs[5].coverUrl = "assets/search/musicas.svg";
      const first = userPlaylists.create(appCurrentUser.id, "Repertório azul", sourceSongs.slice(0, 3).map((song) => ({ songId: song.id })));
      const second = userPlaylists.create(appCurrentUser.id, "Repertório quente", [sourceSongs[2], sourceSongs[3], sourceSongs[4], sourceSongs[5]].map((song) => ({ songId: song.id })));
      homePlaylists.setView("home");
      return { first: first.id, second: second.id, firstSong: sourceSongs[0].id, missingSong: sourceSongs[5].id };
    });
    await page.waitForTimeout(120);
    const firstRow = page.locator(`[data-playlist-id="${playlistIds.first}"]`);
    const secondRow = page.locator(`[data-playlist-id="${playlistIds.second}"]`);
    assert.equal(await firstRow.locator(".home-playlist-art.has-mosaic img").count(), 3);
    assert.equal(await secondRow.locator(".home-playlist-art.has-mosaic img").count(), 3, "fallback legado não entra no mosaico");
    const firstSources = await firstRow.locator("img").evaluateAll((images) => images.map((image) => image.getAttribute("src")));
    const secondSources = await secondRow.locator("img").evaluateAll((images) => images.map((image) => image.getAttribute("src")));
    assert.equal(firstSources.filter((source) => secondSources.includes(source)).length, 1, "somente a música compartilhada repete a imagem");
    await page.screenshot({ path: path.join(artifacts, "roudy-playlists-mosaico-lista.png"), fullPage: false });

    await page.evaluate((id) => {
      const playlist = userPlaylists.get(appCurrentUser.id, id);
      userPlaylists.removeItem(appCurrentUser.id, id, playlist.items[0].id);
      homePlaylists.renderHome();
    }, playlistIds.first);
    assert.equal(await page.locator(`[data-playlist-id="${playlistIds.first}"] .home-playlist-art.has-mosaic img`).count(), 2, "remoção atualiza o mosaico sem preservar capa antiga");

    await page.evaluate((id) => homePlaylists.open(id), playlistIds.first);
    await page.waitForTimeout(120);
    const heroMosaic = page.locator(".home-playlist-cover .home-playlist-art.has-mosaic");
    assert.equal(await heroMosaic.locator("img").count(), 2);
    await page.screenshot({ path: path.join(artifacts, "roudy-playlist-mosaico-detalhe.png"), fullPage: false });

    await page.evaluate((songId) => {
      storage.set("sc_home_last_opened_song_v1", { songId });
      roudySearchMenu.open();
    }, playlistIds.firstSong);
    await page.locator("#roudy-search").waitFor({ state: "visible" });
    await page.waitForTimeout(300);
    assert.match(await page.locator(".roudy-search-resume-icon img").getAttribute("src"), /^data:image\/svg\+xml/);
    await page.screenshot({ path: path.join(artifacts, "roudy-buscar-capa-resolvida.png"), fullPage: false });
    assert.deepEqual(errors, []);
    console.log("artwork-system-ui.test.js: OK");
  } finally {
    if (browser) await browser.close();
    server.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
