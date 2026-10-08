// Botão "Completar cifra": busca a Letra + Cifras e só acrescenta à música (resumo, tom e capo intactos).
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const executablePath = [process.env.BROWSER_EXECUTABLE, "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"].find((c) => c && fs.existsSync(c));
const types = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json" };
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, "http://localhost").pathname;
  const file = path.resolve(root, pathname === "/" ? "index.html" : decodeURIComponent(pathname.slice(1)));
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return res.writeHead(404).end();
  res.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream" }).end(fs.readFileSync(file));
});
const SHEET = "[Intro]\nC  G  Am\n\n[Verso]\nC        G\nPrimeira linha\nAm       F\nSegunda linha";

(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({ headless: true, executablePath });
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" })).newPage();
  page.on("dialog", (dialog) => dialog.accept());
  await page.addInitScript(() => { const auth = { initialize: async () => ({ authenticated: true }), subscribe: () => () => {}, getState: () => ({ authenticated: true }), getAccessToken: () => "test-token" }; Object.defineProperty(window, "appAuth", { get: () => auth, set: () => {} }); });
  await page.route(/\/api\/(library|collaboration)/, (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await page.route("https://fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  let mode = "found"; const requests = [];
  await page.route("**/api/resumo-harmonico", (r) => {
    requests.push(JSON.parse(r.request().postData() || "{}"));
    if (mode === "limit") return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ schemaVersion: 2, titulo: "Limite", artista: "X", tom: "G", capotraste: null, confianca: "media", observacoes: ["Limite diário de buscas na web atingido.", "Você atingiu o limite de busca na web (10 buscas a cada 24 horas). Novas buscas liberam hoje às 12:30. Enquanto isso, você pode enviar um arquivo ou foto da cifra."], harmonicSummary: { blocos: [{ acordes: ["G", "D"], fraseGuia: null, secao: null }] }, fullChordSheet: null }) });
    if (mode === "missing") return r.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ erro: { codigo: "cifra_nao_encontrada", mensagem: "Não encontrada" } }) });
    return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ schemaVersion: 2, titulo: "Só Resumo", artista: "Artista", tom: "E", capotraste: 4, confianca: "alta", observacoes: [],
      harmonicSummary: { blocos: [{ acordes: ["E", "B"], fraseGuia: null, secao: null }] },
      fullChordSheet: { visibility: "private", source: "web_source", content: SHEET, sections: [{ nome: "Verso", linhas: [{ letra: "Primeira linha", acordes: [{ acorde: "C", posicao: 0 }, { acorde: "G", posicao: 9 }] }] }] } }) });
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: "domcontentloaded" });
  try {
    await page.waitForFunction(() => typeof window.completeSongSheet === "function" && Array.isArray(window.musicas || musicas));
    const id = await page.evaluate(() => {
      const song = { id: "resumo-only-2", title: "Só Resumo", artist: "Artista", key: "D", capo: "2", blocos: [{ l: "", c: "C  G  Am  F" }] };
      musicas = songRepository.addOrReuse(musicas, song).songs; salvar(); renderMusicas();
      return musicas.find((m) => m.title === "Só Resumo").id;
    });
    await page.evaluate((songId) => openDetail(songId), id);
    const button = page.locator("#complete-sheet-button");
    await button.waitFor();
    await button.click();
    await page.getByText("Letra + Cifras adicionada").waitFor();
    assert.equal(requests.length, 1);
    assert.equal(requests[0].titulo, "Só Resumo");
    const saved = await page.evaluate((songId) => musicas.find((m) => String(m.id) === String(songId)), id);
    assert.equal(saved.fullChordSheet.content, SHEET);
    assert.equal(saved.key, "D", "tom mantido");
    assert.equal(String(saved.capo), "2", "capo mantido");
    assert.match(saved.blocos.map((b) => b.c).join(" "), /C\s+G\s+Am\s+F/, "resumo harmônico mantido");
    assert.equal(await page.locator("#complete-sheet-button").count(), 0, "botão some quando a música já está completa");
    // Novo layout em páginas: reabrir a música mostra a Letra + Cifras completa, sem o aviso.
    await page.evaluate((songId) => { closeDetail(); openDetail(songId); }, id);
    assert.equal(await page.locator(".complete-sheet-notice").count(), 0);
    // Não encontrada: abre o editor na aba Letra + Cifras para colar ou anexar.
    mode = "missing";
    const other = await page.evaluate(() => {
      musicas = songRepository.addOrReuse(musicas, { id: "resumo-only-3", title: "Sem Letra", artist: "X", key: "G", capo: "", blocos: [{ l: "", c: "G  D" }] }).songs; salvar(); renderMusicas();
      return musicas.find((m) => m.title === "Sem Letra").id;
    });
    await page.evaluate((songId) => openDetail(songId), other);
    await page.locator("#complete-sheet-button").click();
    await page.locator("#ai-review-full-text").waitFor();
    const untouched = await page.evaluate((songId) => musicas.find((m) => String(m.id) === String(songId)), other);
    assert.ok(!untouched.fullChordSheet, "nada inventado quando não acha");
    // Limite diário: avisa o usuário e não abre o editor nem altera a música.
    mode = "limit";
    const limited = await page.evaluate(() => {
      musicas = songRepository.addOrReuse(musicas, { id: "resumo-only-4", title: "Limite", artist: "X", key: "G", capo: "", blocos: [{ l: "", c: "G  D" }] }).songs; salvar(); renderMusicas();
      return musicas.find((m) => m.title === "Limite").id;
    });
    await page.evaluate(() => closeModal && closeModal());
    await page.evaluate((songId) => openDetail(songId), limited);
    await page.locator("#complete-sheet-button").click();
    await page.getByText("Novas buscas liberam hoje às 12:30").waitFor();
    assert.ok(!(await page.evaluate((songId) => musicas.find((m) => String(m.id) === String(songId)).fullChordSheet, limited)));
    console.log("complete-song-sheet-button-ui.test.js: OK (acrescenta letra, mantém resumo/tom/capo, não encontrada abre editor, limite diário avisa)");
  } finally {
    await browser.close(); server.close();
  }
})().catch((error) => { console.error(error); process.exit(1); });
