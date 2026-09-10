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
  ["assets/icons/roudy-icon-v4-192.png", "192x192", "any"],
  ["assets/icons/roudy-icon-v4-512.png", "512x512", "any"],
  ["assets/icons/roudy-icon-v4-maskable-192.png", "192x192", "maskable"],
  ["assets/icons/roudy-icon-v4-maskable-512.png", "512x512", "maskable"]
];
assert.equal(manifest.icons.length, requiredIcons.length);

for (const [src, sizes, purpose] of requiredIcons) {
  const icon = manifest.icons.find((item) => item.src === src && item.sizes === sizes && item.purpose === purpose);
  assert.ok(icon, `Ícone ${src} (${purpose}) ausente no manifesto`);
  assert.ok(fs.existsSync(path.join(projectRoot, icon.src)), `Arquivo ${icon.src} ausente`);
}
assert.equal(manifest.name, "ROUDY");
assert.equal(manifest.short_name, "ROUDY");
assert.equal(manifest.start_url, ".");
assert.equal(manifest.scope, ".");
assert.equal(manifest.display, "standalone");
assert.equal(manifest.theme_color.toUpperCase(), "#050505");
assert.equal(manifest.background_color.toUpperCase(), "#050505");
assert.match(indexHtml, /rel="manifest" href="manifest\.webmanifest\?v=14"/);
assert.doesNotMatch(indexHtml, /assets\/icons\/icon-(?:48|72|96|128|192|256|512)\.png|icon\.svg/);
assert.match(serviceWorker, /simplificando-cifras-v95-sync-remote-contract/);
assert.match(indexHtml, /<title>ROUDY<\/title>/);
assert.match(indexHtml, /apple-mobile-web-app-title" content="ROUDY"/);
assert.match(indexHtml, /Menos papel, menos distração, mais música/);
assert.match(serviceWorker, /event-collaboration-client\.js\?v=4/);
assert.match(serviceWorker, /js\/ai\/harmonic-summary-client\.js/);
assert.match(serviceWorker, /js\/editor\/song-editor\.js/);
assert.match(indexHtml, /js\/editor\/song-format\.js\?v=8/);
assert.match(serviceWorker, /js\/editor\/song-format\.js\?v=8/);
assert.match(indexHtml, /js\/song-model\.js\?v=4/);
assert.match(serviceWorker, /js\/song-model\.js\?v=4/);
assert.match(indexHtml, /js\/ai\/harmonic-summary-client\.js\?v=8/);
assert.match(serviceWorker, /js\/ai\/harmonic-summary-client\.js\?v=8/);
assert.match(serviceWorker, /js\/song-model\.js/);
assert.match(serviceWorker, /js\/song-repository\.js/);
assert.match(serviceWorker, /js\/library-sync\.js\?v=3/);
assert.match(serviceWorker, /js\/import-library\.js\?v=1/);
assert.match(indexHtml, /js\/ai\/api-config\.js\?v=5/);
assert.match(serviceWorker, /js\/ai\/api-config\.js\?v=5/);
for (const [script, version] of [["youtube-api", 2], ["youtube-song-linker", 1], ["youtube-player", 3], ["youtube-player-ui", 3], ["youtube-ui", 1]]) {
  assert.match(serviceWorker, new RegExp(`js/${script}\\.js\\?v=${version}`));
  assert.match(indexHtml, new RegExp(`js/${script}\\.js\\?v=${version}`));
}
assert.doesNotMatch(indexHtml, /js\/spotify-(?:config|auth|api|song-linker|player|player-ui|ui)\.js/);
assert.match(serviceWorker, /js\/stage-preferences\.js\?v=3/);
assert.match(serviceWorker, /js\/stage-offline\.js\?v=1/);
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
    const removeNetlifyDrawer = () => document.querySelector("netlify-drawer")?.remove();
    document.addEventListener("DOMContentLoaded", () => {
      removeNetlifyDrawer();
      new MutationObserver(removeNetlifyDrawer).observe(document.documentElement, { childList: true, subtree: true });
    });
  }, { playlists: persistedPlaylists, favorites: persistedFavorites });
  const page = await context.newPage();
  const errors = [];
  const failedRequests = [];
  page.on("requestfailed", (request) => {
    if (/cdn\.segment\.com|\/\.netlify\/scripts\/cdp/.test(request.url())) return;
    failedRequests.push(`${request.url()}: ${request.failure()?.errorText || "falhou"}`);
  });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    const injectedPreviewResource = process.env.PWA_TEST_URL && message.text().startsWith("Failed to load resource:");
    if (message.type() === "error" && !injectedPreviewResource && !message.text().includes("[app-auth] authentication failed") && !message.text().includes("ERR_INTERNET_DISCONNECTED")) errors.push(message.text());
  });
  await page.route("https://fonts.googleapis.com/**", (route) => route.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await page.route("**/api/auth/config", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ enabled: false, provider: "local" }) }));

  try {
    const url = process.env.PWA_TEST_URL || `http://127.0.0.1:${server.address().port}/`;
    await page.goto(url, { waitUntil: "domcontentloaded" });
    const devtools = await context.newCDPSession(page);
    const appManifest = await devtools.send("Page.getAppManifest");
    assert.deepEqual(appManifest.errors, [], `Manifesto inválido no Chrome DevTools: ${JSON.stringify(appManifest.errors)}`);
    assert.match(appManifest.url, /manifest\.webmanifest\?v=14$/);
    for (const [src] of requiredIcons) {
      const response = await page.request.get(new URL(src, url).href);
      assert.equal(response.status(), 200, `${src} não retornou HTTP 200`);
      assert.match(response.headers()["content-type"], /^image\/png(?:;|$)/, `${src} sem Content-Type image/png`);
    }
    assert.equal(await page.evaluate(() => localStorage.getItem("cifras_setlists_v1")), persistedPlaylists);
    assert.equal(await page.evaluate(() => localStorage.getItem("cifras_favoritos_v1")), persistedFavorites);
    assert.equal(await page.getByRole("button", { name: "Exportar Biblioteca", exact: true }).count(), 0);
    assert.equal(await page.getByRole("button", { name: "Sincronização", exact: true }).count(), 1);
    page.once("dialog", (dialog) => dialog.dismiss());
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.evaluate(() => exportarBiblioteca())
    ]);
    assert.match(download.suggestedFilename(), /^roudy-biblioteca-\d{4}-\d{2}-\d{2}\.json$/);
    const backupJson = await page.evaluate(() => JSON.stringify(libraryExporter.buildExport({
      catalogoPadrao: [],
      musicas: [musicas[0]],
      events: [],
      playlists: [],
      medleys: [],
      favoritos: [],
      configuracoes: {}
    })));
    await page.getByRole("button", { name: "Sincronização", exact: true }).click();
    assert.match(await page.locator("#modal-body").innerText(), /Biblioteca[\s\S]*Para enviar[\s\S]*Para baixar[\s\S]*Eventos[\s\S]*Somente neste dispositivo/);
    const [diagnosticDownload] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Baixar diagnóstico", exact: true }).click()
    ]);
    assert.match(diagnosticDownload.suggestedFilename(), /^roudy-diagnostico-\d{4}-\d{2}-\d{2}\.json$/);
    const diagnostic = JSON.parse(fs.readFileSync(await diagnosticDownload.path(), "utf8"));
    assert.equal(diagnostic.format, "roudy-sync-diagnostics");
    assert.equal(Object.hasOwn(diagnostic, "accessToken"), false);
    assert.equal(JSON.stringify(diagnostic).includes("Bearer "), false);
    const fileChooserPromise = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Restaurar backup", exact: true }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles({ name: "backup-seguro.json", mimeType: "application/json", buffer: Buffer.from(backupJson) });
    await page.getByText("Backup encontrado", { exact: true }).waitFor();
    assert.match(await page.locator("#modal-body").innerText(), /1 música[\s\S]*Novas\s*0[\s\S]*Já existentes\s*1[\s\S]*Conflitos\s*0/);
    await page.getByRole("button", { name: "Restaurar", exact: true }).click();
    assert.equal(await page.locator(".music-item").count(), 86, "restauração idempotente não duplica a biblioteca");
    assert.equal(await page.evaluate(() => localStorage.getItem("cifras_setlists_v1")), persistedPlaylists);
    assert.equal(await page.evaluate(() => localStorage.getItem("cifras_favoritos_v1")), persistedFavorites);
    await page.getByRole("button", { name: "Fechar", exact: true }).click();
    const serviceWorkerState = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      if (registration.active && registration.active.state !== "activated") {
        await new Promise((resolve) => registration.active.addEventListener("statechange", () => {
          if (registration.active.state === "activated") resolve();
        }));
      }
      return { state: registration.active?.state, scriptURL: registration.active?.scriptURL };
    });
    assert.equal(serviceWorkerState.state, "activated");
    assert.match(serviceWorkerState.scriptURL, /service-worker\.js$/);
    await context.setOffline(true);
    await page.reload({ waitUntil: "domcontentloaded" });
    assert.equal(await page.title(), "ROUDY");
    assert.equal(await page.locator(".music-item").count(), 86);
    assert.equal(await page.evaluate(() => localStorage.getItem("cifras_setlists_v1")), persistedPlaylists);
    assert.equal(await page.evaluate(() => localStorage.getItem("cifras_favoritos_v1")), persistedFavorites);
    assert.equal(errors.length, 0, [...errors, ...failedRequests].join(" | "));
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
