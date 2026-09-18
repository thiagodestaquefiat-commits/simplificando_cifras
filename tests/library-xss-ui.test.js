// Teste de navegador real para o XSS armazenado da biblioteca.
//
// Semeia o localStorage com musicas maliciosas — imitando o que chega por
// importacao de backup ou por sincronizacao da nuvem — abre o app e verifica
// que nenhum script executa e que nenhuma tag injetada existe no DOM.
//
// Nao escreve screenshots e nao acessa a rede: /api/* e as fontes sao
// interceptados. Nenhum artefato entra no repositorio.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

const projectRoot = path.resolve(__dirname, "..");
const executablePath = [
  process.env.BROWSER_EXECUTABLE,
  "/opt/pw-browsers/chromium",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
].find((candidate) => candidate && fs.existsSync(candidate));

const PAYLOAD_TITULO = "<img src=x onerror=\"window.__xss=(window.__xss||0)+1\">Louvor";
const PAYLOAD_ARTISTA = "<svg/onload=\"window.__xss=(window.__xss||0)+1\">Banda";
const PAYLOAD_TOM = "G\"><img src=x onerror=\"window.__xss=(window.__xss||0)+1\">";
const PAYLOAD_ID = "1');window.__xss=(window.__xss||0)+1;//";
const PAYLOAD_ACORDE = "<svg/onload=\"window.__xss=(window.__xss||0)+1\">";

const MUSICAS_MALICIOSAS = [
  {
    id: PAYLOAD_ID,
    title: PAYLOAD_TITULO,
    artist: PAYLOAD_ARTISTA,
    key: PAYLOAD_TOM,
    capo: "",
    blocos: [{ l: "Refrao", c: PAYLOAD_ACORDE + "  G  D" }]
  },
  {
    id: 2,
    title: "Musica normal",
    artist: "Artista normal",
    key: "G",
    capo: "",
    blocos: [{ l: "", c: "G  D  Em  C" }]
  }
];

const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, "http://localhost").pathname;
  const relativePath = pathname === "/" ? "index.html" : decodeURIComponent(pathname.slice(1));
  const filePath = path.resolve(projectRoot, relativePath);
  if (!filePath.startsWith(projectRoot) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    return response.writeHead(404).end("Not found");
  }
  const types = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".webmanifest": "application/manifest+json; charset=utf-8",
    ".png": "image/png"
  };
  response.writeHead(200, { "Content-Type": types[path.extname(filePath)] || "application/octet-stream" });
  fs.createReadStream(filePath).pipe(response);
});

(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true, executablePath });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();

  // Sem rede: nada sai do processo de teste.
  await page.route("**/api/**", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ enabled: false, provider: "local", supabaseUrl: "", supabaseAnonKey: "" })
  }));
  await page.route("https://fonts.googleapis.com/**", (route) =>
    route.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await page.route("https://cdn.jsdelivr.net/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/javascript", body: "" }));

  // Um dialog aberto por alert() significaria execucao de script injetado.
  const dialogs = [];
  page.on("dialog", async (dialog) => { dialogs.push(dialog.message()); await dialog.dismiss(); });

  try {
    // Semeia ANTES do primeiro carregamento, como faria um backup restaurado
    // ou uma sincronizacao vinda de outro dispositivo.
    await page.addInitScript((songs) => {
      try {
        window.localStorage.setItem("sc_songs_v1", JSON.stringify(songs));
        window.localStorage.setItem("cifras_musicas_v1", JSON.stringify(songs));
      } catch (_error) { /* storage indisponivel */ }
    }, MUSICAS_MALICIOSAS);

    await page.goto(`${base}/`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#lista-musicas .music-item");

    // ---------------------------------------------------- 1. lista da biblioteca
    assert.equal(await page.evaluate(() => window.__xss || 0), 0, "script executou ao renderizar a lista");
    assert.equal(await page.locator("#lista-musicas img").count(), 0, "tag <img> injetada na lista");
    assert.equal(await page.locator("#lista-musicas svg").count(), 0, "tag <svg> injetada na lista");

    // O payload precisa aparecer como TEXTO — escapar nao pode significar sumir.
    const titulo = await page.locator(".music-title").first().textContent();
    assert.equal(titulo.includes("<img"), true, "o titulo deixou de ser exibido literalmente");
    const artista = await page.locator(".music-sub").first().textContent();
    assert.equal(artista.includes("<svg"), true, "o artista deixou de ser exibido literalmente");
    const tom = await page.locator(".key-badge").first().textContent();
    assert.equal(tom.includes("<img"), true, "o tom deixou de ser exibido literalmente");
    console.log("  lista da biblioteca: payloads inertes e visiveis como texto");

    // ------------------------------------------- 2. id malicioso no onclick
    // Clicar na musica nao pode executar o codigo embutido no id.
    await page.locator(".music-item").first().click();
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => window.__xss || 0), 0, "script executou pelo id no onclick");
    console.log("  id malicioso no onclick: nao executa ao abrir a musica");

    // --------------------------------------------- 3. acorde malicioso na faixa
    assert.equal(await page.locator("#chord-strip img, #chord-strip svg[onload]").count(), 0,
      "tag injetada pela faixa de diagramas");
    assert.equal(await page.evaluate(() => window.__xss || 0), 0, "script executou pelo nome do acorde");
    console.log("  faixa de diagramas: acorde malicioso inerte");

    // ------------------------------------------------------ 4. estado global
    assert.equal(dialogs.length, 0, `dialogos abertos por script injetado: ${dialogs.join(" | ")}`);
    const injetados = await page.evaluate(() => document.querySelectorAll('img[onerror], svg[onload], script[data-injected]').length);
    assert.equal(injetados, 0, "elementos com handler injetado presentes no documento");
    console.log("  documento inteiro: nenhum handler injetado, nenhum dialogo");

    console.log("library-xss-ui.test.js: OK (titulo, artista, tom, id e acorde via localStorage semeado)");
  } finally {
    await browser.close();
    server.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
