const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require(process.env.ROUDY_TEST_PLAYWRIGHT || "playwright");

const root = path.resolve(process.argv[2] || path.join(__dirname, ".."));
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json" };
const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, "http://localhost").pathname;
  if (pathname.startsWith("/api/")) return response.writeHead(200, { "Content-Type": "application/json" }).end("{}");
  const file = path.resolve(root, pathname === "/" ? "index.html" : decodeURIComponent(pathname.slice(1)));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return response.writeHead(404).end();
  response.writeHead(200, { "Content-Type": mime[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
  fs.createReadStream(file).pipe(response);
});

(async () => {
  let browser;
  try {
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    browser = await chromium.launch({ headless: true, executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
    await page.route("https://fonts.googleapis.com/**", route => route.fulfill({ contentType: "text/css", body: "" }));
    await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: "networkidle" });
    const metrics = await page.evaluate(() => {
      const resources = performance.getEntriesByType("resource");
      const pathname = value => new URL(value).pathname;
      const scripts = resources.filter(item => pathname(item.name).endsWith(".js"));
      const styles = resources.filter(item => pathname(item.name).endsWith(".css"));
      return {
        resourceRequests: resources.length,
        uniqueResources: new Set(resources.map(item => item.name)).size,
        scriptRequests: scripts.length,
        stylesheetRequests: styles.length,
        decodedResourceBytes: resources.reduce((sum, item) => sum + (item.decodedBodySize || 0), 0),
        scriptDecodedBytes: scripts.reduce((sum, item) => sum + (item.decodedBodySize || 0), 0),
        stylesheetDecodedBytes: styles.reduce((sum, item) => sum + (item.decodedBodySize || 0), 0),
      };
    });
    console.log(JSON.stringify({ root, ...metrics }));
  } finally {
    if (browser) await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
