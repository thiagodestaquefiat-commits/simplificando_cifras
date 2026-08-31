const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const apiEndpoint = "https://simplificandocifras-production.up.railway.app/api/resumo-harmonico";
const executablePath = [process.env.BROWSER_EXECUTABLE, "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"].find((candidate) => candidate && fs.existsSync(candidate));
const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, "http://localhost").pathname;
  const relative = pathname === "/" ? "index.html" : decodeURIComponent(pathname.slice(1));
  const file = path.resolve(root, relative);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return response.writeHead(404).end();
  const types = { ".html": "text/html; charset=utf-8", ".js": "application/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".webmanifest": "application/manifest+json; charset=utf-8", ".png": "image/png" };
  response.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(response);
});

const success = {
  schemaVersion: 1, titulo: "<img src=x onerror=alert(1)>Rugido do Leão", artista: "Artista teste", tom: "Dm", confianca: "media", observacoes: ["Revisar harmonia"],
  trechos: [{ acordes: ["D", "C", "D"], repeticoes: 7, fraseGuia: "Ouçam as trombetas", secao: "Introdução" }, { acordes: ["Dm", "Bb", "C", "G"], repeticoes: null, fraseGuia: "Ouçam o grito da vitória", secao: "Refrão" }]
};

(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({ headless: true, executablePath });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.addInitScript(() => {
    const fakeAuth = { initialize: async () => ({ authenticated: true }), subscribe: () => () => {}, getState: () => ({ authenticated: true }), getAccessToken: () => "test-access-token" };
    Object.defineProperty(window, "appAuth", { configurable: false, get: () => fakeAuth, set: () => {} });
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error" && !message.text().startsWith("Failed to load resource:")) errors.push(message.text()); });
  await page.route("https://fonts.googleapis.com/**", (route) => route.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: "domcontentloaded" });
  try {
    await page.getByRole("button", { name: "Gerar com IA", exact: true }).click();
    assert.equal(await page.locator("#ai-summary-overlay").isVisible(), true);
    await page.getByRole("button", { name: "Gerar resumo", exact: true }).click();
    assert.match(await page.locator("[data-ai-status]").innerText(), /Informe o título/);

    let pendingRoute;
    let requestBody;
    await page.route(apiEndpoint, async (route) => { pendingRoute = route; requestBody = route.request().postDataJSON(); }, { times: 1 });
    const researchForm = page.locator("[data-ai-form=pesquisa]");
    await researchForm.getByLabel("Título da música").fill("Rugido do Leão");
    await researchForm.getByLabel("Artista (opcional)").fill("Artista teste");
    await page.getByRole("button", { name: "Gerar resumo", exact: true }).click();
    assert.equal(await page.getByRole("button", { name: "Analisando…", exact: true }).isDisabled(), true);
    assert.match(await page.locator("[data-ai-status]").innerText(), /Analisando a estrutura harmônica/);
    assert.deepEqual(requestBody, { tipo: "pesquisa", titulo: "Rugido do Leão", artista: "Artista teste" });
    await pendingRoute.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(success) });
    await page.getByText("Revisar resumo harmônico", { exact: true }).waitFor({ state: "visible" });
    assert.equal(await page.locator("#song-editor").count(), 0);
    assert.equal(await page.getByLabel("Título", { exact: true }).inputValue(), "img src=x onerror=alert(1)Rugido do Leão");
    assert.equal(await page.getByLabel("Artista", { exact: true }).inputValue(), "Artista teste");
    assert.equal(await page.getByLabel("Tom original", { exact: true }).inputValue(), "Dm");
    assert.equal(await page.getByLabel("Capotraste", { exact: true }).inputValue(), "");
    assert.match(await page.getByLabel("Cifra / Resumo", { exact: true }).inputValue(), /Introdução\nOuçam as trombetas\nD\s+C\s+D\s+\(7x\)/);
    await page.setViewportSize({ width: 390, height: 844 });
    const mobileEditor = await page.getByLabel("Cifra / Resumo", { exact: true }).boundingBox();
    assert.ok(mobileEditor && mobileEditor.width <= 358);
    await page.setViewportSize({ width: 1280, height: 720 });
    assert.equal(await page.getByLabel("Posição do acorde").count(), 0);
    assert.equal(await page.getByRole("button", { name: "Duplicar" }).count(), 0);
    assert.equal(await page.evaluate(() => localStorage.getItem("sc_song_editor_drafts_v1")), null);
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("cifras_musicas_v1") || "[]").some((song) => song.title.includes("Rugido"))), false);
    await page.getByLabel("Título", { exact: true }).fill("Alteração cancelada");
    await page.getByLabel("Cifra / Resumo", { exact: true }).fill("Intro\nF Am G");
    await page.getByRole("button", { name: "Cancelar", exact: true }).click();
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("cifras_musicas_v1") || "[]").some((song) => song.title === "Alteração cancelada")), false);

    await page.getByRole("button", { name: "Gerar com IA", exact: true }).click();
    const secondResearch = page.locator("[data-ai-form=pesquisa]");
    await secondResearch.getByLabel("Título da música").fill("Rugido do Leão");
    await page.route(apiEndpoint, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(success) }), { times: 1 });
    await page.getByRole("button", { name: "Gerar resumo", exact: true }).click();
    await page.getByText("Revisar resumo harmônico", { exact: true }).waitFor({ state: "visible" });
    await page.getByLabel("Título", { exact: true }).fill("Resumo revisado");
    await page.getByLabel("Artista", { exact: true }).fill("Artista revisado");
    await page.getByLabel("Tom original", { exact: true }).fill("E");
    await page.getByLabel("Capotraste", { exact: true }).fill("2");
    await page.getByLabel("Cifra / Resumo", { exact: true }).fill("Intro\nAqui na terra como no céu\nE A B  (3x)\n\nFinal\nB A E");
    await page.getByRole("button", { name: "Salvar", exact: true }).click();
    const storedSongs = await page.evaluate(() => JSON.parse(localStorage.getItem("cifras_musicas_v1") || "[]"));
    const reviewedSong = storedSongs.find((song) => song.title === "Resumo revisado");
    assert.ok(reviewedSong);
    assert.equal(reviewedSong.artist, "Artista revisado");
    assert.equal(reviewedSong.key, "E");
    assert.equal(reviewedSong.capo, "Capotraste casa 2");
    assert.equal(reviewedSong.aiGenerated, true);
    assert.equal(reviewedSong.reviewedByUser, true);
    assert.equal(reviewedSong.editorData.sections[0].lines[0].lyrics, "Aqui na terra como no céu");
    assert.equal(reviewedSong.editorData.sections[0].lines[0].repeticoes, 3);
    assert.match(await page.locator("#detail-content").innerText(), /Aqui na terra como no céu/);
    await page.locator(".transpose-bar .t-btn").last().click();
    assert.equal(await page.locator("#transposed-key").innerText(), "F");
    await page.getByRole("button", { name: "Editar cifra", exact: true }).click();
    await page.getByText("Revisar resumo harmônico", { exact: true }).waitFor({ state: "visible" });
    assert.equal(await page.locator("#song-editor").count(), 0);
    assert.equal(await page.getByLabel("Título", { exact: true }).inputValue(), "Resumo revisado");
    await page.getByRole("button", { name: "Cancelar", exact: true }).click();
    await page.evaluate(() => closeDetail());

    async function verifyError(status, code, expected) {
      await page.getByRole("button", { name: "Gerar com IA", exact: true }).click();
      await page.locator("[data-ai-form=pesquisa]").getByLabel("Título da música").fill("Teste");
      await page.route(apiEndpoint, (route) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify({ erro: { codigo: code } }) }), { times: 1 });
      await page.getByRole("button", { name: "Gerar resumo", exact: true }).click();
      await page.waitForTimeout(80);
      assert.match(await page.locator("[data-ai-status]").innerText(), expected);
      await page.getByRole("button", { name: "Fechar", exact: true }).click();
    }
    await page.unroute(apiEndpoint);
    await verifyError(422, "resultado_nao_confiavel", /Não foi possível gerar um resumo harmônico confiável/);
    await verifyError(429, "limite_excedido", /limite de solicitações/);
    await verifyError(504, "provedor_timeout", /demorou mais que o esperado/);
    await verifyError(429, "provedor_rate_limit", /temporariamente ocupado/);
    await verifyError(422, "provedor_rejeitou_requisicao", /processar este arquivo/);
    await verifyError(502, "resposta_estruturada_invalida", /organizar esta cifra corretamente/);
    await verifyError(502, "resposta_provedor_invalida", /resposta inválida/);
    await verifyError(503, "provedor_indisponivel", /temporariamente indisponível/);
    await verifyError(500, "erro_interno", /servidor não conseguiu/);

    await page.getByRole("button", { name: "Gerar com IA", exact: true }).click();
    await page.getByRole("tab", { name: "Texto", exact: true }).click();
    await page.getByLabel("Cifra, letra com acordes, anotações ou estrutura musical").fill("Dm Bb C G");
    let textPayload;
    await page.route(apiEndpoint, (route) => { textPayload = route.request().postDataJSON(); return route.abort("failed"); }, { times: 1 });
    await page.getByRole("button", { name: "Analisar texto", exact: true }).click();
    await page.waitForTimeout(80);
    assert.deepEqual(textPayload, { tipo: "texto", conteudo: "Dm Bb C G" });
    assert.match(await page.locator("[data-ai-status]").innerText(), /conectar ao servidor/);
    await page.getByRole("button", { name: "Fechar", exact: true }).click();

    await page.getByRole("button", { name: "Gerar com IA", exact: true }).click();
    await page.getByRole("tab", { name: "Arquivo", exact: true }).click();
    const fileForm = page.locator("[data-ai-form=arquivo]");
    assert.equal(await fileForm.isVisible(), true);
    await fileForm.getByLabel(/PDF, PNG, JPG/).setInputFiles({ name: "cifra.txt", mimeType: "text/plain", buffer: Buffer.from("Tom: Dm\nDm Bb C G") });
    let multipartRequest;
    await page.route(apiEndpoint, async (route) => { multipartRequest = route.request(); await route.abort("failed"); }, { times: 1 });
    await page.getByRole("button", { name: "Gerar resumo", exact: true }).click();
    await page.waitForTimeout(80);
    assert.match(multipartRequest.headers()["content-type"], /multipart\/form-data; boundary=/);
    assert.match(multipartRequest.postData(), /cifra\.txt/);
    assert.match(await page.locator("[data-ai-status]").innerText(), /conectar ao servidor/);
    await page.getByRole("button", { name: "Fechar", exact: true }).click();

    assert.equal(errors.length, 0, errors.join(" | "));
    console.log("ai-harmonic-summary-ui.test.js: OK (modal, modos, loading, sucesso, erros, rascunho, transposição e XSS)");
  } finally { await context.close(); await browser.close(); server.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
