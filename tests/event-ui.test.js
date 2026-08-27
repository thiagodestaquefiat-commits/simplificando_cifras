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
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().includes("Failed to load resource: the server responded with a status of 404")) errors.push(message.text());
  });
  await page.route("https://fonts.googleapis.com/**", (route) => route.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await page.route("**/api/auth/config", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ enabled: false, provider: "local", supabaseUrl: "", supabaseAnonKey: "" }) }));
  await page.route("**/api/collaboration/**", (route) => route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ erro: { codigo: "erro_http", mensagem: "Backend ainda não publicado" } }) }));
  await page.route("**/api/locations/search**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ results: [{ placeId: "place-central", name: "Igreja Central", formattedAddress: "Igreja Central, Rua das Flores, 100, Blumenau, SC, Brasil", street: "Rua das Flores", streetNumber: "100", district: "Centro", city: "Blumenau", state: "Santa Catarina", postalCode: "89000-000", country: "Brasil", latitude: -26.9187, longitude: -49.066, provider: "geoapify" }] }) }));
  await page.route("**/api/locations/map**", (route) => route.fulfill({ status: 200, contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="720" height="320"><rect width="100%" height="100%" fill="#17324d"/></svg>' }));

  try {
    await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: "domcontentloaded" });
    await page.locator("#tab-setlists").click();
    await page.evaluate(() => {
      setlists = eventModel.normalizeCollection([
        { id: "older", title: "Evento antigo", date: "05/07/2026", time: "20:00" },
        { id: "newest", title: "Evento mais recente", date: "2026-09-10", time: "19:00" },
        { id: "middle", title: "Evento intermediário", date: "23/08/2026", time: "09:00" }
      ]);
      renderSetlists();
    });
    assert.deepEqual(await page.locator("#lista-setlists .sl-title").allTextContents(), ["Evento mais recente", "Evento intermediário", "Evento antigo"]);
    await page.evaluate(() => {
      appBands = [{ id: "band-test", name: "Equipe de Teste", currentUserRole: "owner", permissions: { canManageMembers: true }, members: [{ id: appCurrentUser.id, name: appCurrentUser.name, musicalRole: "Liderança", accessRole: "owner", avatarUrl: null }] }];
      activeBandId = "band-test";
      renderBandToolbar();
    });
    assert.equal(await page.locator("#active-band-select").inputValue(), "band-test");
    await page.locator(".fab").click();
    assert.equal(await page.locator("#fs-band").inputValue(), "band-test");
    assert.equal(await page.locator("#fs-date").getAttribute("type"), "date");
    assert.equal(await page.getByText("Toque para escolher no calendário", { exact: true }).count(), 1);
    await page.locator("#fs-title").fill("Culto de teste");
    await page.locator("#fs-date").fill("2026-08-23");
    await page.locator("#fs-time").fill("19:30");
    await page.locator("#fs-location").fill("Igreja Central");
    await page.locator(".location-option").waitFor();
    await page.locator("#fs-location").press("ArrowDown");
    await page.locator("#fs-location").press("Enter");
    assert.equal(await page.locator("#fs-location").inputValue(), "Igreja Central, Rua das Flores, 100, Blumenau, SC, Brasil");
    assert.equal(await page.locator("#fs-location-preview .event-map-card").count(), 1);
    await page.locator("#fs-description").fill("Passagem de som às 18h");
    await page.locator("#pl-all .pl-add-row").first().click();
    await page.locator("#event-member-name").fill("Ana Souza");
    await page.locator("#event-member-role").selectOption({ label: "Vocal" });
    await page.locator(".event-add-member button").click();
    await page.getByRole("button", { name: "Salvar evento" }).click();
    await page.waitForFunction(() => setlists.some(event => event.title === "Culto de teste"));
    assert.equal(await page.evaluate(() => setlists.find(event => event.title === "Culto de teste").bandId), "band-test");

    await page.evaluate(() => openSD(setlists.find(event => event.title === "Culto de teste").id));
    assert.equal(await page.locator(".event-meta-item").getByText("23/08/2026", { exact: true }).count(), 1);
    assert.equal(await page.getByText("Igreja Central, Rua das Flores, 100, Blumenau, SC, Brasil", { exact: true }).count() >= 1, true);
    assert.equal(await page.locator("#event-detail-map .event-map-card").count(), 1);
    assert.match(await page.locator("#event-detail-map a", { hasText: "Abrir no mapa" }).getAttribute("href"), /google\.com\/maps\/search/);
    assert.equal(await page.locator(".event-member-card").getByText("Ana Souza", { exact: true }).count(), 1);
    assert.equal(await page.locator(".event-member-card").getByText("Vocal", { exact: true }).count(), 1);
    assert.equal(await page.getByText("Você lidera", { exact: true }).count(), 1);
    assert.equal(await page.locator("button", { hasText: "Editar oficial" }).count(), 1);

    await page.locator(".event-song-edit").first().click();
    assert.equal(await page.getByText("Editar música", { exact: true }).count(), 1);
    assert.equal(await page.getByText("Pessoal — somente para mim", { exact: true }).count(), 1);
    assert.equal(await page.getByText("Compartilhada — todos do evento", { exact: true }).count(), 1);
    for (const label of ["Título", "Artista", "Tom original", "Capotraste", "Cifra / Resumo"]) assert.equal(await page.getByLabel(label, { exact: true }).count(), 1, label);
    await page.locator('input[name="event-edit-scope"][value="shared"]').check();
    await page.getByLabel("Título", { exact: true }).fill("A alegria oficial");
    await page.getByLabel("Artista", { exact: true }).fill("Equipe oficial");
    await page.getByLabel("Tom original", { exact: true }).fill("D");
    await page.getByLabel("Capotraste", { exact: true }).fill("2");
    await page.getByLabel("Cifra / Resumo", { exact: true }).fill("Verso oficial\nLinha para todos\nD G A");
    await page.locator("#event-song-notes").fill("Começar somente com violão");
    await page.locator("#modal-body").getByRole("button", { name: "Salvar", exact: true }).click();
    await page.getByText(/Começar somente com violão/).waitFor();
    assert.equal(await page.getByText("A alegria oficial", { exact: true }).count(), 1);
    assert.equal(await page.getByText(/Começar somente com violão/).count(), 1);
    assert.equal(await page.getByText(/Oficial — todos do evento/).count(), 1);

    await page.locator(".event-song-edit").first().click();
    await page.locator('input[name="event-edit-scope"][value="personal"]').check();
    await page.getByLabel("Título", { exact: true }).fill("A alegria pessoal");
    await page.getByLabel("Tom original", { exact: true }).fill("E");
    await page.getByLabel("Capotraste", { exact: true }).fill("0");
    await page.getByLabel("Cifra / Resumo", { exact: true }).fill("Versão pessoal\nMinha execução\nE A B");
    await page.locator("#event-song-notes").fill("Somente para minha execução");
    await page.locator("#modal-body").getByRole("button", { name: "Salvar", exact: true }).click();
    await page.getByText(/Somente para minha execução/).waitFor();
    assert.equal(await page.getByText(/Somente para minha execução/).count(), 1);
    assert.equal(await page.locator(".event-scope-badge.personal").count(), 1);
    assert.equal(await page.getByText("A alegria pessoal", { exact: true }).count(), 1);
    await page.locator(".sd-row").first().click();
    assert.equal(await page.locator("#detail-title").textContent(), "A alegria pessoal");
    assert.match(await page.locator("#detail-content").innerText(), /Minha execução/);
    await page.evaluate(() => closeDetail());

    await page.evaluate(() => {
      const current = findEvent(currentSdId);
      const otherLeader = current.members.find(member => String(member.id) !== String(appCurrentUser.id));
      setlists = eventRepository.upsert(setlists, eventModel.create({ ...current, id: "member-view", title: "Evento como integrante", leaderId: otherLeader.id })).events;
      openSD("member-view");
    });
    assert.equal(await page.locator("button", { hasText: "Editar oficial" }).count(), 0);
    assert.equal(await page.locator("#view-sd button", { hasText: "Excluir" }).count(), 0);
    await page.locator(".event-song-edit").first().click();
    assert.equal(await page.locator('input[name="event-edit-scope"][value="shared"]').count(), 0);
    await page.getByRole("button", { name: "Cancelar" }).click();

    await page.evaluate(() => openSD(setlists.find(event => event.title === "Culto de teste").id));

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
