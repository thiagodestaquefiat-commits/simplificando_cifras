const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

const projectRoot = path.resolve(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(projectRoot, "manifest.webmanifest"), "utf8"));
const html = fs.readFileSync(path.join(projectRoot, "index.html"), "utf8");
const serviceWorker = fs.readFileSync(path.join(projectRoot, "service-worker.js"), "utf8");
const requiredSizes = [48, 72, 96, 128, 192, 256, 512];

for (const size of requiredSizes) {
  const icon = manifest.icons.find((item) => item.sizes === `${size}x${size}`);
  assert.ok(icon, `Ícone ${size}x${size} ausente no manifesto`);
  assert.equal(icon.src, `assets/icons/pwa-icon-v9-${size}.png`);
  assert.ok(fs.existsSync(path.join(projectRoot, icon.src)), `Arquivo ${icon.src} ausente`);
}
assert.equal(manifest.theme_color.toUpperCase(), "#07111F");
assert.equal(manifest.background_color.toUpperCase(), "#07111F");
assert.equal(manifest.shortcuts, undefined);
assert.match(html, /manifest\.webmanifest\?v=9/);
assert.match(html, /logo-simplificando-cifras-v9\.png/);
assert.match(html, /pwa-icon-v9-48\.png/);
assert.match(html, /pwa-icon-v9-96\.png/);
assert.match(html, /pwa-icon-v9-192\.png/);
assert.doesNotMatch(html, /mask-icon/i);
assert.match(serviceWorker, /simplificando-cifras-v9/);
assert.doesNotMatch(serviceWorker, /icon\.svg|assets\/icons\/icon-|simplificando-cifras-v8/);

const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, "http://localhost").pathname;
  const relativePath = pathname === "/" ? "index.html" : decodeURIComponent(pathname.slice(1));
  const filePath = path.resolve(projectRoot, relativePath);
  if (!filePath.startsWith(projectRoot) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    response.writeHead(404).end("Not found");
    return;
  }
  const types = { ".html": "text/html; charset=utf-8", ".js": "application/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".webmanifest": "application/manifest+json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png" };
  response.writeHead(200, { "Content-Type": types[path.extname(filePath)] || "application/octet-stream" });
  fs.createReadStream(filePath).pipe(response);
});

(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const executablePath = [
    process.env.BROWSER_EXECUTABLE,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
  ].find((candidate) => candidate && fs.existsSync(candidate));
  const browser = await chromium.launch({ headless: true, executablePath });
  const context = await browser.newContext();
  const persistedPlaylists = '[{"id":"preservada","title":"Repertório preservado","musicas":[1,2]}]';
  const persistedFavorites = '[1,2]';
  await context.addInitScript(({ playlists, favorites }) => {
    localStorage.setItem("cifras_setlists_v1", playlists);
    localStorage.setItem("cifras_favoritos_v1", favorites);
  }, { playlists: persistedPlaylists, favorites: persistedFavorites });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.route("https://fonts.googleapis.com/**", (route) => route.fulfill({ status: 200, contentType: "text/css", body: "" }));

  try {
    const url = `http://127.0.0.1:${server.address().port}/`;
    await page.goto(url, { waitUntil: "domcontentloaded" });
    assert.equal(await page.evaluate(() => localStorage.getItem("cifras_setlists_v1")), persistedPlaylists);
    assert.equal(await page.evaluate(() => localStorage.getItem("cifras_favoritos_v1")), persistedFavorites);
    page.once("dialog", (dialog) => dialog.dismiss());
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Exportar Biblioteca", exact: true }).click()
    ]);
    assert.match(download.suggestedFilename(), /^simplificando-cifras-biblioteca-\d{4}-\d{2}-\d{2}\.json$/);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await context.setOffline(true);
    await page.reload({ waitUntil: "domcontentloaded" });
    assert.equal(await page.title(), "Simplificando Cifras");
    assert.equal(await page.locator(".music-item").count(), 86);
    assert.equal(await page.evaluate(() => localStorage.getItem("cifras_setlists_v1")), persistedPlaylists);
    assert.equal(await page.evaluate(() => localStorage.getItem("cifras_favoritos_v1")), persistedFavorites);
    assert.equal(errors.length, 0, errors.join(" | "));
    console.log("pwa-branding.test.js: OK");
  } finally {
    await context.close();
    await browser.close();
    server.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
