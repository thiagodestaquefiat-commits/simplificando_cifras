const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

const projectRoot = path.resolve(__dirname, "..");
const outputDir = path.join(projectRoot, "docs", "screenshots", "sprint-4");
const browserExecutable = [
  process.env.BROWSER_EXECUTABLE,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
].find((candidate) => candidate && fs.existsSync(candidate));

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

async function capture(page, name) {
  await page.screenshot({ path: path.join(outputDir, name), fullPage: false });
}

(async () => {
  fs.mkdirSync(outputDir, { recursive: true });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({ headless: true, executablePath: browserExecutable });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  await context.addInitScript(() => {
    localStorage.setItem("cifras_setlists_v1", JSON.stringify([
      { id: "sprint-4", title: "Ensaio de domingo", date: "20/07/2026", musicas: [1, 2, 3] }
    ]));
  });
  const page = await context.newPage();
  const errors = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("https://fonts.googleapis.com/**", (route) => route.fulfill({ status: 200, contentType: "text/css", body: "" }));

  try {
    await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: "domcontentloaded" });
    await capture(page, "01-principal-mobile-390x844.png");

    await page.getByText("Playlists", { exact: false }).click();
    await capture(page, "02-playlists-mobile-390x844.png");
    await page.getByText("Ensaio de domingo", { exact: true }).click();
    await page.locator(".sd-row").first().click();
    await capture(page, "03-musica-mobile-390x844.png");
    await page.locator("#btn-palco").click();
    await capture(page, "04-modo-palco-mobile-390x844.png");

    await page.setViewportSize({ width: 1366, height: 768 });
    await page.reload({ waitUntil: "domcontentloaded" });
    await capture(page, "05-principal-desktop-1366x768.png");

    assert.equal(errors.length, 0, errors.join(" | "));
    console.log("sprint4-visual.test.js: OK");
  } finally {
    await context.close();
    await browser.close();
    server.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
