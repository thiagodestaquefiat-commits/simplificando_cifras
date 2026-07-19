const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

const projectRoot = path.resolve(__dirname, "..");
const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml"
};

const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, "http://localhost").pathname;
  const relativePath = pathname === "/" ? "index.html" : decodeURIComponent(pathname.slice(1));
  const filePath = path.resolve(projectRoot, relativePath);
  if (!filePath.startsWith(projectRoot) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    response.writeHead(404).end("Not found");
    return;
  }
  response.writeHead(200, { "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream" });
  fs.createReadStream(filePath).pipe(response);
});

const sizes = [
  [320, 640],
  [360, 800],
  [390, 844],
  [768, 1024],
  [1366, 768],
  [1920, 1080]
];

const browserExecutable = [
  process.env.BROWSER_EXECUTABLE,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
].find((candidate) => candidate && fs.existsSync(candidate));

async function openApp(browser, baseUrl, width, height) {
  const context = await browser.newContext({ viewport: { width, height }, serviceWorkers: "block" });
  await context.addInitScript(() => {
    localStorage.setItem("cifras_setlists_v1", JSON.stringify([
      { id: "teste", title: "Playlist de teste", date: "18/07/2026", musicas: [1, 2, 3] }
    ]));
  });
  const page = await context.newPage();
  await page.route("https://fonts.googleapis.com/**", (route) => route.fulfill({
    status: 200,
    contentType: "text/css; charset=utf-8",
    body: ""
  }));
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  return { context, page, errors };
}

(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}/`;
  const browser = await chromium.launch({ headless: true, executablePath: browserExecutable });

  try {
    for (const [width, height] of sizes) {
      const { context, page, errors } = await openApp(browser, baseUrl, width, height);
      const layout = await page.evaluate(() => {
        const app = document.getElementById("app").getBoundingClientRect();
        const exportButton = document.querySelector(".export-library-btn").getBoundingClientRect();
        return {
          bodyScrollWidth: document.body.scrollWidth,
          appLeft: app.left,
          appRight: app.right,
          appWidth: app.width,
          exportLeft: exportButton.left,
          exportRight: exportButton.right
        };
      });
      assert.ok(layout.bodyScrollWidth <= width, `${width}x${height}: rolagem horizontal na página`);
      assert.ok(layout.appLeft >= 0 && layout.appRight <= width + 0.5, `${width}x${height}: app fora da viewport`);
      assert.ok(layout.appWidth <= 720.5, `${width}x${height}: app largo demais`);
      assert.ok(layout.exportLeft >= 0 && layout.exportRight <= width, `${width}x${height}: exportação fora da viewport`);
      assert.equal(errors.length, 0, `${width}x${height}: erros no console: ${errors.join(" | ")}`);
      await context.close();
    }

    const { context, page, errors } = await openApp(browser, baseUrl, 320, 640);

    await page.getByPlaceholder("Buscar música ou tom...").fill("A alegria");
    await page.getByText("A alegria", { exact: true }).click();
    assert.equal(await page.locator("#btn-previous-song").isVisible(), false);
    assert.equal(await page.locator("#btn-next-song").isVisible(), false);
    assert.equal(await page.locator("#chord-diagrams-section").isVisible(), true);
    assert.ok(await page.locator(".chord-card").count() > 0);

    const strip = page.locator(".chord-strip-wrap");
    const stripMetrics = await strip.evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth
    }));
    assert.ok(stripMetrics.scrollWidth >= stripMetrics.clientWidth);
    await strip.evaluate((element) => { element.scrollLeft = element.scrollWidth; });
    const lastCardVisible = await page.locator(".chord-card").last().evaluate((element) => {
      const card = element.getBoundingClientRect();
      const stripRect = element.parentElement.getBoundingClientRect();
      return card.right <= stripRect.right + 1 && card.left >= stripRect.left - 1;
    });
    assert.equal(lastCardVisible, true);

    await page.getByRole("button", { name: "+", exact: true }).click();
    assert.match(await page.locator("#detail-key").textContent(), /Bb/);
    await page.locator("#capo-opt-1").click();
    assert.ok(await page.locator("#capo-opt-1").evaluate((element) => element.classList.contains("active")));

    await page.locator("#btn-palco").click();
    assert.equal(await page.locator("#chord-diagrams-section").isVisible(), false);
    assert.equal(await page.locator(".transpose-bar").isVisible(), true);
    await page.locator("#btn-speed").click();
    await page.locator("#btn-font").click();
    await page.locator("#btn-scroll").click();
    assert.ok(await page.locator("#btn-scroll").evaluate((element) => element.classList.contains("active")));
    await page.locator("#btn-scroll").click();
    await page.locator("#btn-palco").click();
    assert.equal(await page.locator("#chord-diagrams-section").isVisible(), true);

    await page.locator(".back-btn").first().click();
    await page.getByPlaceholder("Buscar música ou tom...").fill("");
    await page.getByText("Quem é esse", { exact: true }).click();
    assert.ok(await page.locator(".chord-card-unavailable").count() > 0);
    assert.ok(await page.getByText("Diagrama não disponível", { exact: true }).count() > 0);
    await page.locator(".back-btn").first().click();

    await page.getByText("Playlists", { exact: false }).click();
    await page.getByText("Playlist de teste", { exact: true }).click();
    await page.locator(".sd-row").first().click();
    assert.equal(await page.locator("#btn-previous-song").isVisible(), true);
    assert.equal(await page.locator("#btn-previous-song").isDisabled(), true);
    assert.equal(await page.locator("#btn-next-song").isEnabled(), true);
    await page.locator("#btn-next-song").click();
    assert.equal(await page.locator("#detail-title").textContent(), "A Ele a glória");
    assert.equal(await page.locator("#btn-previous-song").isEnabled(), true);
    await page.locator("#btn-palco").click();
    await page.locator("#btn-next-song").click();
    assert.equal(await page.locator("#detail-title").textContent(), "A casa é sua");
    assert.ok(await page.locator("#view-detail").evaluate((element) => element.classList.contains("stage-mode")));
    assert.equal(await page.locator("#btn-next-song").isDisabled(), true);

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByText("Playlists", { exact: false }).click();
    assert.equal(await page.getByText("Playlist de teste", { exact: true }).count(), 1);
    assert.equal(await page.getByRole("button", { name: "Exportar Biblioteca", exact: true }).count(), 1);
    assert.equal(errors.length, 0, `Erros no console: ${errors.join(" | ")}`);

    await context.close();
    console.log("ui-responsiveness.test.js: OK");
  } finally {
    await browser.close();
    server.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
