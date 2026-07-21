const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

const projectRoot = path.resolve(__dirname, "..");
const outputDir = path.join(projectRoot, "docs", "screenshots", "multi-instrumentos");
const instruments = [
  { id: "guitar", name: "Violão & Guitarra", renderer: "fretted", courses: "6", file: "01-violao" },
  { id: "ukulele", name: "Ukulele", renderer: "fretted", courses: "4", file: "02-ukulele" },
  { id: "keyboard", name: "Teclado", renderer: "keyboard", courses: null, file: "03-teclado" },
  { id: "cavaquinho", name: "Cavaco", renderer: "fretted", courses: "4", file: "04-cavaco" },
  { id: "viola-caipira-cebolao-e", name: "Viola Caipira", renderer: "double-course-fretted", courses: "5", file: "05-viola" }
];
const executablePath = [
  process.env.BROWSER_EXECUTABLE,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
].find((candidate) => candidate && fs.existsSync(candidate));

const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, "http://localhost").pathname;
  const relativePath = pathname === "/" ? "index.html" : decodeURIComponent(pathname.slice(1));
  const filePath = path.resolve(projectRoot, relativePath);
  if (!filePath.startsWith(projectRoot) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) return response.writeHead(404).end("Not found");
  const types = { ".html": "text/html; charset=utf-8", ".js": "application/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".webmanifest": "application/manifest+json; charset=utf-8", ".png": "image/png" };
  response.writeHead(200, { "Content-Type": types[path.extname(filePath)] || "application/octet-stream" });
  fs.createReadStream(filePath).pipe(response);
});

(async () => {
  fs.mkdirSync(outputDir, { recursive: true });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({ headless: true, executablePath });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.route("https://fonts.googleapis.com/**", (route) => route.fulfill({ status: 200, contentType: "text/css", body: "" }));

  try {
    await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: "domcontentloaded" });
    await page.getByText("Liberta-me de mim", { exact: true }).click();
    for (const instrument of instruments) {
      await page.locator("#inst-btn").click();
      await page.locator(`#inst-list [onclick="setInstrument('${instrument.id}')"]`).click();
      assert.equal(await page.locator(".chord-card-unavailable").count(), 0, `${instrument.name}: diagrama indisponível`);
      assert.ok(await page.locator(".chord-card").count() >= 4, `${instrument.name}: poucos diagramas`);
      assert.equal(await page.locator(".chord-card").first().getAttribute("data-instrument"), instrument.id);
      assert.equal(await page.locator(".chord-card").first().getAttribute("data-renderer"), instrument.renderer);
      if (instrument.courses) assert.equal(await page.locator(".chord-card").first().getAttribute("data-courses"), instrument.courses);
      assert.equal(await page.locator(".chord-card-name", { hasText: "A9" }).count(), 1, `${instrument.name}: A9`);
      assert.equal(await page.locator(".chord-card-name", { hasText: "B4" }).count(), 1, `${instrument.name}: B4`);
      assert.equal(await page.locator(".chord-card-name").first().evaluate((element) => getComputedStyle(element).color), "rgb(232, 137, 107)");
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("sc_instrument_v1"))), instrument.id);
      await page.locator("#view-detail").evaluate((element) => { element.scrollTop = 0; });
      await page.locator(".chord-strip-wrap").evaluate((element) => { element.scrollLeft = 0; });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: path.join(outputDir, `${instrument.file}-mobile-390x844.png`), fullPage: false });
    }

    await page.locator('button[onclick="transpose(+1)"]').click();
    assert.equal(await page.locator(".chord-card-unavailable").count(), 0);
    assert.equal(await page.locator(".chord-card").first().getAttribute("data-instrument"), "viola-caipira-cebolao-e");

    await page.evaluate(() => {
      musicas.push({ id: "future-test", title: "Música futura", artist: "Importada ou IA", key: "C", capo: "", blocos: [{ l: "Letra preservada", c: "Cmaj9  Cm7(b5)  D/F#  Gadd9" }] });
      openDetail("future-test");
    });
    assert.equal(await page.locator(".chord-card-unavailable").count(), 0);
    assert.equal(await page.locator(".chord-card").first().getAttribute("data-instrument"), "guitar");
    assert.equal(await page.locator(".letra-linha").first().evaluate((element) => getComputedStyle(element).color), "rgb(248, 250, 252)");
    assert.equal(errors.length, 0, errors.join(" | "));
    console.log("multi-instrument-ui.test.js: OK (5 instrumentos, mobile, transposição e música futura)");
  } finally {
    await context.close();
    await browser.close();
    server.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
