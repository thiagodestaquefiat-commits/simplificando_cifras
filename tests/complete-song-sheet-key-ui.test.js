// Completar cifra em outro tom (Thiago, 23/10): a Letra + Cifras vem para o tom do resumo harmônico.
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
const SHEET_A = "INTRO\nA9   F#m7   E4   D7M\n\nPRIMEIRA PARTE\n      A\nNada novo achei\n        F#m7\nPra dizer, então\n      E4\nComo expressar\n         D\nMinha gratidão?";

(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({ headless: true, executablePath });
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" })).newPage();
  page.on("dialog", (dialog) => dialog.accept());
  await page.addInitScript(() => { const auth = { initialize: async () => ({ authenticated: true }), subscribe: () => () => {}, getState: () => ({ authenticated: true }), getAccessToken: () => "test-token" }; Object.defineProperty(window, "appAuth", { get: () => auth, set: () => {} }); });
  await page.route(/\/api\/(library|collaboration)/, (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await page.route("https://fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await page.route("**/api/resumo-harmonico", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ schemaVersion: 2, titulo: "Gratidão", artista: "Felipe Rodrigues", tom: "A", capotraste: null, confianca: "alta", observacoes: [],
    harmonicSummary: { blocos: [{ acordes: ["A", "F#m", "E", "D"], fraseGuia: null, secao: null }] },
    fullChordSheet: { visibility: "private", source: "web_source", content: SHEET_A, sections: [] } }) }));
  await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: "domcontentloaded" });
  try {
    await page.waitForFunction(() => typeof window.completeSongSheet === "function" && Array.isArray(window.musicas || musicas));
    // 1) Completar: resumo em G, cifra encontrada em A -> salva a cifra em G.
    const id = await page.evaluate(() => {
      musicas = songRepository.addOrReuse(musicas, { id: "gratidao-g", title: "Gratidão", artist: "Felipe Rodrigues", key: "G", capo: "", blocos: [{ l: "Nada novo achei / Em resposta a Ti", c: "G  Em  D  C  (2x)" }, { l: "Então vou levantar / Ei meu coração", c: "G  D  C  Em  D  (2x)" }] }).songs; salvar(); renderMusicas();
      return musicas.find((m) => m.title === "Gratidão").id;
    });
    await page.evaluate((songId) => openDetail(songId), id);
    await page.locator("#complete-sheet-button").click();
    await page.getByText("Letra + Cifras adicionada").waitFor();
    const saved = await page.evaluate((songId) => musicas.find((m) => String(m.id) === String(songId)), id);
    assert.match(saved.fullChordSheet.content, /G9\s+Em7\s+D4\s+C7M/, "intro levada para G");
    assert.ok(!/F#m7/.test(saved.fullChordSheet.content), "nada de acorde do tom de A");
    assert.match(saved.fullChordSheet.content, /Nada novo achei/, "letra intacta");
    assert.equal(saved.key, "G", "tom mantido");
    assert.match(saved.blocos.map((b) => b.c).join(" "), /G\s+Em\s+D\s+C/, "resumo mantido");
    assert.equal(await page.getByText("outro tom que o resumo").count(), 0, "sem aviso depois de corrigido");
    // 2) Música antiga já completada no tom errado: aviso + botão ajusta a cifra para o tom do resumo.
    const old = await page.evaluate((sheet) => {
      musicas = songRepository.addOrReuse(musicas, { id: "gratidao-old", title: "Gratidão Antiga", artist: "Felipe Rodrigues", key: "G", capo: "", blocos: [{ l: "", c: "G  Em  D  C  (2x)" }, { l: "", c: "G  D  C  Em  D  (2x)" }], fullChordSheet: { visibility: "private", source: "web_source", content: sheet, sections: [] } }).songs; salvar(); renderMusicas();
      return musicas.find((m) => m.title === "Gratidão Antiga").id;
    }, SHEET_A);
    await page.evaluate((songId) => { closeDetail(); openDetail(songId); }, old);
    const fix = page.getByRole("button", { name: /Ajustar cifra para o tom G/ });
    assert.equal(await fix.count(), 1, "mostra o aviso de tom diferente");
    await page.evaluate((songId) => fixSheetKey(songId), old);
    const fixed = await page.evaluate((songId) => musicas.find((m) => String(m.id) === String(songId)), old);
    assert.match(fixed.fullChordSheet.content, /G9\s+Em7\s+D4\s+C7M/);
    assert.equal(await page.getByText("outro tom que o resumo").count(), 0, "aviso some");
    console.log("complete-song-sheet-key-ui.test.js: OK (completa no tom do resumo, ajusta cifra antiga em outro tom)");
  } finally {
    await browser.close(); server.close();
  }
})().catch((error) => { console.error(error); process.exit(1); });
