const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

const projectRoot = path.resolve(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(projectRoot, "manifest.webmanifest"), "utf8"));
const indexHtml = fs.readFileSync(path.join(projectRoot, "index.html"), "utf8");
const serviceWorker = fs.readFileSync(path.join(projectRoot, "service-worker.js"), "utf8");
const requiredIcons = [
  ["assets/icons/pwa-icon-v10-192.png", "192x192", "any"],
  ["assets/icons/pwa-icon-v10-512.png", "512x512", "any"],
  ["assets/icons/pwa-icon-v10-maskable-192.png", "192x192", "maskable"],
  ["assets/icons/pwa-icon-v10-maskable-512.png", "512x512", "maskable"]
];
assert.equal(manifest.icons.length, requiredIcons.length);

for (const [src, sizes, purpose] of requiredIcons) {
  const icon = manifest.icons.find((item) => item.src === src && item.sizes === sizes && item.purpose === purpose);
  assert.ok(icon, `Ícone ${src} (${purpose}) ausente no manifesto`);
  assert.ok(fs.existsSync(path.join(projectRoot, icon.src)), `Arquivo ${icon.src} ausente`);
}
assert.equal(manifest.name, "Simplificando Cifras");
assert.equal(manifest.short_name, "Cifras");
assert.equal(manifest.start_url, ".");
assert.equal(manifest.scope, ".");
assert.equal(manifest.display, "standalone");
assert.equal(manifest.theme_color.toUpperCase(), "#07111F");
assert.equal(manifest.background_color.toUpperCase(), "#07111F");
assert.match(indexHtml, /rel="manifest" href="manifest\.webmanifest\?v=10"/);
assert.doesNotMatch(indexHtml, /assets\/icons\/icon-(?:48|72|96|128|192|256|512)\.png|icon\.svg/);
assert.match(serviceWorker, /simplificando-cifras-v13/);
assert.match(serviceWorker, /js\/editor\/song-editor\.js/);
assert.match(serviceWorker, /js\/editor\/song-editor\.css/);
assert.match(serviceWorker, /js\/instruments\/instrument-definitions\.js/);
assert.match(serviceWorker, /js\/instruments\/multi-instrument-chord-library\.js/);
assert.match(serviceWorker, /self\.skipWaiting\(\)/);
assert.match(serviceWorker, /self\.clients\.claim\(\)/);
assert.doesNotMatch(serviceWorker, /\.\/icon\.svg|\.\/assets\/icons\/icon-(?:48|72|96|128|192|256|512)\.png|"\.\/manifest\.webmanifest"/);

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
    const devtools = await context.newCDPSession(page);
    const appManifest = await devtools.send("Page.getAppManifest");
    assert.deepEqual(appManifest.errors, [], `Manifesto inválido no Chrome DevTools: ${JSON.stringify(appManifest.errors)}`);
    assert.match(appManifest.url, /manifest\.webmanifest\?v=10$/);
    for (const [src] of requiredIcons) {
      const response = await page.request.get(new URL(src, url).href);
      assert.equal(response.status(), 200, `${src} não retornou HTTP 200`);
      assert.match(response.headers()["content-type"], /^image\/png(?:;|$)/, `${src} sem Content-Type image/png`);
    }
    assert.equal(await page.evaluate(() => localStorage.getItem("cifras_setlists_v1")), persistedPlaylists);
    assert.equal(await page.evaluate(() => localStorage.getItem("cifras_favoritos_v1")), persistedFavorites);
    page.once("dialog", (dialog) => dialog.dismiss());
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Exportar Biblioteca", exact: true }).click()
    ]);
    assert.match(download.suggestedFilename(), /^simplificando-cifras-biblioteca-\d{4}-\d{2}-\d{2}\.json$/);
    const serviceWorkerState = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      if (registration.active && registration.active.state !== "activated") {
        await new Promise((resolve) => registration.active.addEventListener("statechange", () => {
          if (registration.active.state === "activated") resolve();
        }, { once: false }));
      }
      return { state: registration.active?.state, scriptURL: registration.active?.scriptURL };
    });
    assert.equal(serviceWorkerState.state, "activated");
    assert.match(serviceWorkerState.scriptURL, /service-worker\.js$/);
    await context.setOffline(true);
    await page.reload({ waitUntil: "domcontentloaded" });
    assert.equal(await page.title(), "Simplificando Cifras");
    assert.equal(await page.locator(".music-item").count(), 86);
    await page.getByText("Liberta-me de mim", { exact: true }).click();
    await page.getByRole("button", { name: "Editar cifra" }).click();
    assert.equal(await page.locator("#song-editor").isVisible(), true);
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
