const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require(process.env.ROUDY_TEST_PLAYWRIGHT || "playwright");

const root = path.resolve(__dirname, "..");
const artifacts = path.join(root, "artifacts", "search-card-copy-v570");
const types = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png" };
const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, "http://localhost").pathname;
  const file = path.resolve(root, pathname === "/" ? "index.html" : decodeURIComponent(pathname.slice(1)));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return response.writeHead(404).end();
  response.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(response);
});

(async () => {
  let browser;
  try {
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    fs.mkdirSync(artifacts, { recursive: true });
    browser = await chromium.launch({ headless: true, executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
    for (const width of [350, 390, 430]) {
      const page = await browser.newPage({ viewport: { width, height: 844 }, serviceWorkers: "block" });
      await page.route("https://fonts.googleapis.com/**", (route) => route.fulfill({ contentType: "text/css", body: "" }));
      await page.route("**/api/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
      await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: "domcontentloaded" });
      await page.getByRole("button", { name: "Continuar sem login" }).click();
      await page.evaluate(() => window.roudySearchMenu.open());
      await page.locator("#roudy-search").waitFor({ state: "visible" });
      await page.waitForTimeout(250);
      const geometry = await page.locator(".roudy-search-shortcut").evaluateAll((cards) => cards.map((card) => {
        const image = card.querySelector("img").getBoundingClientRect();
        const copy = card.querySelector(".roudy-search-card-copy").getBoundingClientRect();
        return { image: { left: image.left, top: image.top, right: image.right, bottom: image.bottom }, copy: { left: copy.left, top: copy.top, right: copy.right, bottom: copy.bottom } };
      }));
      geometry.forEach(({ image, copy }) => {
        assert.ok(copy.left >= image.left - 1 && copy.right <= image.right + 1, `texto deve ficar horizontalmente dentro da arte em ${width}px`);
        assert.ok(copy.top >= image.top - 1 && copy.bottom <= image.bottom + 1, `texto deve ficar verticalmente dentro da arte em ${width}px`);
      });
      await page.screenshot({ path: path.join(artifacts, `buscar-${width}x844.png`), fullPage: false });
      await page.close();
    }
    console.log("search-card-copy-ui.test.js: OK");
  } finally {
    if (browser) await browser.close();
    server.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
