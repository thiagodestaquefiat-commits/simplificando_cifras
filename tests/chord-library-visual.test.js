const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

const projectRoot = path.resolve(__dirname, "..");
const outputDir = path.join(projectRoot, "docs", "screenshots", "biblioteca-acordes");
const chordColorOutputDir = path.join(projectRoot, "docs", "screenshots", "cor-acordes");
const chordColor = "rgb(232, 137, 107)";
const executablePath = [
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

(async () => {
  fs.mkdirSync(outputDir, { recursive: true });
  fs.mkdirSync(chordColorOutputDir, { recursive: true });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({ headless: true, executablePath });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  await context.addInitScript(() => {
    localStorage.setItem("cifras_musicas_v1", JSON.stringify([{
      id: 9001,
      title: "Demonstração da biblioteca",
      artist: "Acordes independentes do catálogo",
      key: "C#",
      capo: "",
      blocos: [
        { l: "Aliases preservados", c: "B4  A4  Db  Gb" },
        { l: "Extensões", c: "C#maj7  Dm7  E9  Fadd9" },
        { l: "Baixos e inversões", c: "G/B  G/A  BbM7/D" }
      ]
    }]));
  });
  const page = await context.newPage();
  const errors = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("https://fonts.googleapis.com/**", (route) => route.fulfill({ status: 200, contentType: "text/css", body: "" }));

  try {
    await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: "domcontentloaded" });
    await page.getByText("Demonstração da biblioteca", { exact: true }).click();
    assert.equal(await page.locator(".chord-card").count(), 11);
    assert.equal(await page.locator(".chord-card-unavailable").count(), 0);
    assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--chord-color").trim()), "#E8896B");
    assert.equal(await page.locator(".chord-card-name").first().evaluate((element) => getComputedStyle(element).color), chordColor);
    assert.equal(await page.locator(".chord-line").first().evaluate((element) => getComputedStyle(element).color), chordColor);
    assert.notEqual(await page.locator(".letra-linha").first().evaluate((element) => getComputedStyle(element).color), chordColor);
    assert.equal(await page.locator(".letra-linha").first().evaluate((element) => getComputedStyle(element).color), "rgb(248, 250, 252)");
    await page.screenshot({ path: path.join(outputDir, "01-normalizacao-mobile-390x844.png"), fullPage: false });
    await page.screenshot({ path: path.join(chordColorOutputDir, "01-diagramas-mobile-390x844.png"), fullPage: false });

    await page.locator(".chord-strip-wrap").evaluate((element) => { element.scrollLeft = element.scrollWidth; });
    await page.screenshot({ path: path.join(outputDir, "02-baixos-mobile-390x844.png"), fullPage: false });

    await page.locator("#detail-content").scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(chordColorOutputDir, "02-cifra-mobile-390x844.png"), fullPage: false });

    await page.locator('button[onclick="transpose(+1)"]').click();
    assert.equal(await page.locator(".chord-line").first().evaluate((element) => getComputedStyle(element).color), chordColor);
    assert.equal(await page.locator(".chord-card-name").first().evaluate((element) => getComputedStyle(element).color), chordColor);

    await page.locator("#btn-palco").click();
    assert.equal(await page.locator(".chord-line").first().evaluate((element) => getComputedStyle(element).color), chordColor);
    await page.screenshot({ path: path.join(chordColorOutputDir, "03-modo-palco-mobile-390x844.png"), fullPage: false });
    await page.locator("#btn-palco").click();

    await page.setViewportSize({ width: 1366, height: 768 });
    await page.screenshot({ path: path.join(outputDir, "03-biblioteca-desktop-1366x768.png"), fullPage: false });
    await page.screenshot({ path: path.join(chordColorOutputDir, "04-transposicao-desktop-1366x768.png"), fullPage: false });
    assert.equal(errors.length, 0, errors.join(" | "));
    console.log("chord-library-visual.test.js: OK");
  } finally {
    await context.close();
    await browser.close();
    server.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
