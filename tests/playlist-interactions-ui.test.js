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
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("https://fonts.googleapis.com/**", (route) => route.fulfill({ contentType: "text/css", body: "" }));
    await page.route("**/api/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
    await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Continuar sem login" }).click();
    await page.waitForFunction(() => window.homePlaylists && typeof musicas !== "undefined" && Array.isArray(musicas));
    const ids = await page.evaluate(() => {
      const first = userPlaylists.create(appCurrentUser.id, "Primeira playlist");
      const second = userPlaylists.create(appCurrentUser.id, "Playlist para fixar");
      homePlaylists.setView("home");
      return { first: first.id, second: second.id };
    });

    assert.equal(await page.locator(".home-playlists-filter").count(), 0, "chip Playlists removido");
    const row = page.locator(`.home-playlist-row[data-playlist-id="${ids.second}"]`);
    await row.dispatchEvent("pointerdown", { pointerType: "touch", clientX: 30, clientY: 120 });
    await page.waitForTimeout(520);
    await page.getByRole("button", { name: "Fixar playlist", exact: true }).click();
    await page.waitForTimeout(80);
    assert.equal(await page.locator(".home-playlist-row").first().getAttribute("data-playlist-id"), ids.second, "playlist fixada sobe para o início");

    await page.locator(`.home-playlist-row[data-playlist-id="${ids.second}"]`).dispatchEvent("pointerdown", { pointerType: "touch", clientX: 30, clientY: 120 });
    await page.waitForTimeout(520);
    const pin = page.locator(".home-playlist-context-actions .home-playlist-pin-icon.is-pinned");
    assert.equal(await pin.count(), 1, "playlist fixada usa o desenho de pin azul");
    assert.equal(await pin.evaluate((icon) => getComputedStyle(icon).fill), "none", "pin permanece desenhado, sem virar uma bolinha preenchida");
    await page.screenshot({ path: path.join(artifacts, "roudy-playlist-press-options.png"), fullPage: false });
    await page.evaluate(() => homePlaylists.closeActionSheet());

    await page.evaluate((id) => homePlaylists.open(id), ids.first);
    await page.evaluate(() => homePlaylists.pickCover("library"));
    const widePng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAFElEQVR42mP4z8DwH4QZGBgYGMAAAAD//wMAH9oE/QAAAABJRU5ErkJggg==", "base64");
    await page.locator("#home-playlist-cover-input").setInputFiles({ name: "capa.png", mimeType: "image/png", buffer: widePng });
    await page.locator("#home-playlist-cover-crop-frame").waitFor();
    await page.waitForTimeout(280);
    const cropBefore = await page.locator("#home-playlist-cover-crop-image").evaluate((image) => image.style.left);
    const cropFrame = await page.locator("#home-playlist-cover-crop-frame").boundingBox();
    await page.mouse.move(cropFrame.x + cropFrame.width / 2, cropFrame.y + cropFrame.height / 2);
    await page.mouse.down();
    await page.mouse.move(cropFrame.x + cropFrame.width / 2 + 36, cropFrame.y + cropFrame.height / 2);
    await page.mouse.up();
    const cropAfter = await page.locator("#home-playlist-cover-crop-image").evaluate((image) => image.style.left);
    assert.notEqual(cropAfter, cropBefore, "a foto da capa pode ser reposicionada por arraste");
    await page.screenshot({ path: path.join(artifacts, "roudy-playlist-cover-crop.png"), fullPage: false });
    await page.getByRole("button", { name: "Usar foto" }).click();
    await page.waitForTimeout(80);
    const userCover = await page.evaluate((id) => userPlaylists.get(appCurrentUser.id, id).coverImage, ids.first);
    assert.match(userCover, /^data:image\/jpeg;base64,/, "recorte ajustado salvo como capa");

    await page.locator("#tab-search").click();
    await page.waitForTimeout(40);
    assert.equal(await page.locator("#tab-search").getAttribute("aria-selected"), "true", "Buscar assume o estado ativo ao toque");
    assert.equal(await page.locator("#tab-search .tab-icon-filled").evaluate((icon) => getComputedStyle(icon).fill), "rgb(7, 137, 231)", "lupa ativa é preenchida com o azul ROUDY");
    await page.evaluate(() => roudySearchMenu.close());

    await page.evaluate((id) => { homePlaylists.open(id); homePlaylists.openAddSongs(); }, ids.second);
    const before = await page.locator("#home-playlist-add-list .event-admin-song-row").count();
    if (before) {
      await page.locator("#home-playlist-add-list .event-admin-add-button").first().click();
      await page.waitForTimeout(250);
      assert.equal(await page.locator("#home-playlist-add-list .event-admin-song-row").count(), before - 1, "música adicionada desaparece da seleção");
    }
    assert.deepEqual(errors, []);
    console.log("playlist-interactions-ui.test.js: OK");
  } finally {
    if (browser) await browser.close();
    server.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
