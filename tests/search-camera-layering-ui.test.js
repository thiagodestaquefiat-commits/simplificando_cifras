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
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
    const page = await context.newPage();
    await page.route("https://fonts.googleapis.com/**", (route) => route.fulfill({ contentType: "text/css", body: "" }));
    await page.route("**/api/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
    await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Continuar sem login" }).click();
    await page.evaluate(() => roudySearchMenu.open());
    await page.locator("#roudy-search.is-open").waitFor();
    await page.getByRole("button", { name: "Fotografar ou importar uma cifra" }).click();
    await page.locator("[data-camera-gallery]").setInputFiles({ name: "cifra.png", mimeType: "image/png", buffer: Buffer.from("imagem-de-teste") });
    await page.evaluate(() => {
      window.aiHarmonicSummary = { generateFiles: async () => openAiDraft({
        title: "Canção fotografada",
        artist: "Artista",
        originalKey: "A",
        capo: 0,
        sections: [{ label: "Verso", lines: [{ chords: ["A", "F#m7"], lyric: "Tua cruz" }] }],
        aiGenerated: true
      }, null) };
    });
    await page.getByRole("button", { name: "Usar foto" }).click();
    await page.waitForTimeout(260);
    assert.equal(await page.locator(".roudy-camera").count(), 0, "câmera fecha após concluir");
    assert.equal(await page.locator("#roudy-search").isHidden(), true, "Buscar fecha antes de revelar o editor");
    assert.equal(await page.locator("#modal-overlay").evaluate((element) => getComputedStyle(element).display), "flex", "editor permanece visível");
    await page.screenshot({ path: path.join(artifacts, "roudy-buscar-camera-sheet-corrigido.png"), fullPage: false });
    console.log("search-camera-layering-ui.test.js: OK");
  } finally {
    if (browser) await browser.close();
    server.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
