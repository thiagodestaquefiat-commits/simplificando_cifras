// Tela de resolução de conflitos de sincronização.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const executablePath = [process.env.BROWSER_EXECUTABLE, "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"].find((c) => c && fs.existsSync(c));
const types = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json" };
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, "http://localhost").pathname;
  const file = path.resolve(root, pathname === "/" ? "index.html" : decodeURIComponent(pathname.slice(1)));
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return res.writeHead(404).end();
  res.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream" }).end(fs.readFileSync(file));
});
const SHEET = "[Intro]\nC  G  Am\n\n[Verso]\nC        G\nPrimeira linha\nAm       F\nSegunda linha";

(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({ headless: true, executablePath });
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" })).newPage();
  page.on("dialog", (dialog) => dialog.accept());
  await page.addInitScript(() => { const auth = { initialize: async () => ({ authenticated: true }), subscribe: () => () => {}, getState: () => ({ authenticated: true }), getAccessToken: () => "test-token" }; Object.defineProperty(window, "appAuth", { get: () => auth, set: () => {} }); });
  await page.route(/\/api\/(library|collaboration)/, (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await page.route("https://fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: "domcontentloaded" });
  try {
    await page.waitForFunction(() => typeof window.openConflictResolver === "function" && window.librarySync);
    const clientId = await page.evaluate(() => {
      const base = { id: "conf-1", title: "Yeshua + Ruja O Leão | SESSÃO LIVRE", artist: "Maverick City Brazil", key: "C", capo: "", blocos: [], updatedAt: "2026-09-28T10:00:00.000Z" };
      const remote = { ...base, title: "Yeshua", artist: "Fernandinho", key: "Am", blocos: [{ l: "Intro", c: "Am  Em  F  G" }], updatedAt: "2026-09-29T08:00:00.000Z" };
      musicas = [...musicas, { ...base, librarySync: { clientId: "cid-conf-1", serverVersion: 3, syncedAt: null, contentHash: "x", conflict: { remoteVersion: 4, remoteSongData: remote, remoteUpdatedAt: remote.updatedAt } } }];
      songRepository.save(musicas); renderMusicas();
      return "cid-conf-1";
    });
    await page.evaluate(() => openConflictResolver());
    await page.getByText("Resolver conflitos").first().waitFor();
    const card = page.locator(`[data-conflict="${clientId}"]`);
    assert.match(await card.innerText(), /Neste aparelho[\s\S]*Maverick City Brazil[\s\S]*Na nuvem[\s\S]*Fernandinho/);
    assert.match(await card.innerText(), /Na nuvem \(outro aparelho\) \(mais recente\)/);
    await card.getByRole("button", { name: "Usar a da nuvem" }).click();
    const resolved = await page.evaluate((id) => musicas.find((m) => m.librarySync?.clientId === id), clientId);
    assert.equal(resolved.title, "Yeshua"); assert.equal(resolved.artist, "Fernandinho"); assert.equal(resolved.librarySync.conflict, null);
    const backups = await page.evaluate(() => librarySync.conflictBackups());
    assert.equal(backups.at(-1).songData.artist, "Maverick City Brazil", "versão descartada guardada");
    console.log("sync-conflict-resolver-ui.test.js: OK (lista versões, mais recente, usar a da nuvem, backup)");
  } finally {
    await browser.close(); server.close();
  }
})().catch((error) => { console.error(error); process.exit(1); });
