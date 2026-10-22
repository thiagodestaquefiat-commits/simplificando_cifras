const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require(process.env.ROUDY_TEST_PLAYWRIGHT || "playwright");

const root = path.resolve(__dirname, "..");
const artifacts = path.join(root, "artifacts");
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
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
    await page.route("https://fonts.googleapis.com/**", (route) => route.fulfill({ contentType: "text/css", body: "" }));
    await page.route("**/api/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
    await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Continuar sem login" }).click();
    await page.evaluate(() => {
      const other = { id: "chat-other", name: "Ana", avatarUrl: null };
      const event = eventModel.create({ id: "chat-bubbles", title: "Chat visual", members: [{ ...appCurrentUser, isLeader: true }, other], leaderId: appCurrentUser.id });
      setlists.push(event);
      const base = Date.now() - 240000;
      storage.set("sc_event_messages_v1", { [event.id]: [
        { id: "received-short", eventId: event.id, type: "text", sender: other, content: "Oi!", reactions: {}, createdAt: new Date(base).toISOString() },
        { id: "received-long", eventId: event.id, type: "text", sender: other, content: "Esta é uma mensagem recebida mais longa para validar a largura, a quebra de linha e a cauda integrada ao balão.", reactions: {}, createdAt: new Date(base + 10000).toISOString() },
        { id: "mine-short", eventId: event.id, type: "text", sender: { id: appCurrentUser.id, name: appCurrentUser.name }, content: "Oi", reactions: {}, createdAt: new Date(base + 70000).toISOString() },
        { id: "mine-long", eventId: event.id, type: "text", sender: { id: appCurrentUser.id, name: appCurrentUser.name }, content: "Mensagem enviada mais longa, mantendo o horário e os indicadores fora do texto.", replyTo: "received-short", reactions: {}, createdAt: new Date(base + 80000).toISOString() }
      ] });
      currentSdId = event.id;
      openEventChat();
    });
    await page.locator("#event-chat-view").waitFor({ state: "visible" });
    const mine = page.locator('.event-message.mine.is-group-end .event-message-bubble');
    const received = page.locator('.event-message:not(.mine).is-group-end .event-message-bubble');
    assert.equal(await mine.evaluate((element) => getComputedStyle(element).backgroundColor), "rgb(7, 137, 231)");
    assert.equal(await mine.evaluate((element) => getComputedStyle(element, "::after").backgroundColor), "rgb(7, 137, 231)");
    assert.equal(await received.evaluate((element) => getComputedStyle(element).backgroundColor), "rgb(36, 36, 38)");
    assert.equal(await received.evaluate((element) => getComputedStyle(element, "::after").backgroundColor), "rgb(36, 36, 38)");
    assert.equal(await page.locator('.event-message:not(.is-group-end) .event-message-bubble').first().evaluate((element) => getComputedStyle(element, "::after").content), "none");
    await page.screenshot({ path: path.join(artifacts, "roudy-chat-bubbles-v566.png"), fullPage: false });
    console.log("event-chat-bubbles-ui.test.js: OK");
  } finally {
    if (browser) await browser.close();
    server.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
