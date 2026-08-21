const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const browserExecutable = [
  process.env.BROWSER_EXECUTABLE,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
].find((candidate) => candidate && fs.existsSync(candidate));

const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, "http://localhost").pathname;
  const relative = pathname === "/" ? "index.html" : decodeURIComponent(pathname.slice(1));
  const file = path.resolve(root, relative);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return response.writeHead(404).end();
  const types = { ".html": "text/html", ".js": "application/javascript", ".json": "application/json", ".png": "image/png", ".webmanifest": "application/manifest+json" };
  response.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(response);
});

(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({ headless: true, executablePath: browserExecutable });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.route("https://fonts.googleapis.com/**", (route) => route.fulfill({ status: 200, contentType: "text/css", body: "" }));

  try {
    await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: "domcontentloaded" });
    await page.getByText("Eventos", { exact: false }).click();
    await page.locator(".fab").click();
    await page.locator("#fs-title").fill("Culto de teste");
    await page.locator("#fs-date").fill("23/08/2026");
    await page.locator("#fs-time").fill("19:30");
    await page.locator("#fs-location").fill("Igreja Central");
    await page.locator("#fs-description").fill("Passagem de som às 18h");
    await page.locator("#pl-all .pl-add-row").first().click();
    await page.locator("#event-member-name").fill("Ana Souza");
    await page.locator("#event-member-role").selectOption({ label: "Vocal" });
    await page.locator(".event-add-member button").click();
    await page.getByRole("button", { name: "Salvar evento" }).click();

    await page.getByText("Culto de teste", { exact: true }).click();
    assert.equal(await page.getByText("Igreja Central", { exact: true }).count(), 1);
    assert.equal(await page.locator(".event-member-card").getByText("Ana Souza", { exact: true }).count(), 1);
    assert.equal(await page.locator(".event-member-card").getByText("Vocal", { exact: true }).count(), 1);

    await page.locator(".event-song-edit").first().click();
    await page.locator('input[name="event-edit-scope"][value="shared"]').check();
    await page.locator("#event-song-key").fill("D");
    await page.locator("#event-song-notes").fill("Começar somente com violão");
    await page.getByRole("button", { name: "Salvar ajuste" }).click();
    assert.equal(await page.getByText(/Começar somente com violão/).count(), 1);

    await page.locator(".event-chat-fab").click();
    await page.locator("#event-chat-input").fill("Olá, equipe!");
    await page.locator(".event-chat-send").click();
    assert.equal(await page.getByText("Olá, equipe!", { exact: true }).count(), 1);

    await page.locator(".event-chat-poll-open").click();
    await page.locator("#poll-question").fill("Qual música abre o evento?");
    await page.locator("#poll-options").fill("Música A\nMúsica B");
    await page.getByRole("button", { name: "Publicar enquete" }).click();
    assert.equal(await page.getByText(/Qual música abre o evento/).count(), 1);
    await page.locator(".event-poll-option").first().click();
    assert.match(await page.locator(".event-poll-total").last().textContent(), /1 participante/);
    assert.deepEqual(errors, []);
    console.log("event-ui.test.js: OK");
  } finally {
    await context.close();
    await browser.close();
    server.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
