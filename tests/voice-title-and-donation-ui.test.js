// Microfone no título (Gerar com IA) e QR de doações em Minha conta.
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
  await page.addInitScript(() => {
    class FakeRecognition { start() { this.onstart && this.onstart(); setTimeout(() => { this.onresult && this.onresult({ results: [[{ transcript: "isaías 9" }]] }); this.onend && this.onend(); }, 30); } stop() { this.onend && this.onend(); } }
    window.SpeechRecognition = FakeRecognition; window.webkitSpeechRecognition = FakeRecognition;
  });
  await page.addInitScript(() => { const auth = { initialize: async () => ({ authenticated: true }), subscribe: () => () => {}, getState: () => ({ authenticated: true }), getAccessToken: () => "test-token" }; Object.defineProperty(window, "appAuth", { get: () => auth, set: () => {} }); });
  await page.route(/\/api\/(library|collaboration)/, (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await page.route("https://fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: "domcontentloaded" });
  try {
    await page.waitForFunction(() => window.aiHarmonicSummary && typeof window.openAccountModal === "function");
    await page.evaluate(() => aiHarmonicSummary.open());
    const dialog = page.locator("#ai-summary-overlay");
    const mic = dialog.locator(".ai-summary-voice");
    assert.equal(await mic.count(), 1, "microfone no campo título");
    await mic.click();
    await page.waitForFunction(() => document.querySelector('#ai-summary-overlay input[name=titulo]').value === "Isaías 9");
    assert.equal(await dialog.getByLabel("Título da música").inputValue(), "Isaías 9");
    await dialog.getByRole("button", { name: "Fechar" }).first().click();
    await page.evaluate(() => { currentAuthState = { ...currentAuthState, enabled: true }; return openAccountModal(); });
    const qr = page.locator("img.account-contribution-qr");
    await qr.waitFor();
    assert.ok(await qr.evaluate((img) => img.complete && img.naturalWidth > 0), "imagem do QR carregada");
    assert.equal(await page.locator(".account-contribution-copy").count(), 1);
    console.log("voice-title-and-donation-ui.test.js: OK (microfone preenche o título; QR de doações em Minha conta)");
  } finally {
    await browser.close(); server.close();
  }
})().catch((error) => { console.error(error); process.exit(1); });
