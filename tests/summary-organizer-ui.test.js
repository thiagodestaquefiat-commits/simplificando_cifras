// Organizar resumos: acha as músicas fora do padrão, mostra antes/depois e só salva as confirmadas.
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

const SHEET = "[Primeira Parte]\n\nFm         Db9\nPrimeira linha do verso aqui\n\n[Refrão]\n\nBbm      Db9       Fm   Cm\nLinha do refrão número um";

(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({ headless: true, executablePath });
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" })).newPage();
  page.on("dialog", (dialog) => dialog.accept());
  await page.addInitScript(() => { const auth = { initialize: async () => ({ authenticated: true }), subscribe: () => () => {}, getState: () => ({ authenticated: true }), getAccessToken: () => "test-token" }; Object.defineProperty(window, "appAuth", { get: () => auth, set: () => {} }); });
  const sent = [];
  await page.route("**/api/resumo-harmonico/organizar", (r) => {
    const body = JSON.parse(r.request().postData() || "{}"); sent.push(...body.musicas.map((song) => song.id));
    const resultados = body.musicas.map((song) => song.id === "org-1"
      ? { id: song.id, changed: true, blocos: [{ acordes: ["Fm", "Db9"], repeticoes: null, fraseGuia: "Primeira linha do verso aqui" }, { acordes: ["Bbm", "Db9", "Fm", "Cm"], repeticoes: 2, fraseGuia: "Linha do refrão número um" }] }
      : { id: song.id, changed: false, motivo: "ja_no_padrao" });
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ resultados }) });
  });
  await page.route(/\/api\/(library|collaboration)/, (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await page.route("https://fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: "domcontentloaded" });
  try {
    await page.waitForFunction(() => typeof window.openSummaryOrganizer === "function" && window.summaryOrganizer && window.songRepository);
    await page.evaluate((sheet) => {
      musicas = [];
      musicas = songRepository.addOrReuse(musicas, { id: "org-1", title: "Sem Frases", artist: "A", key: "Fm", capo: "Capotraste casa 2", blocos: [{ l: "", c: "Fm  Db9" }, { l: "", c: "Bbm  Db9  Fm  Cm" }],
        fullChordSheet: { visibility: "private", source: "web_source", content: sheet, sections: [] } }).songs;
      musicas = songRepository.addOrReuse(musicas, { id: "org-2", title: "Já Bonita", artist: "B", key: "G", capo: "", blocos: [{ l: "", c: "G  D  (2x)\nFrase que já existe" }],
        fullChordSheet: { visibility: "private", source: "web_source", content: "G D\nFrase que já existe", sections: [] } }).songs;
      musicas = songRepository.addOrReuse(musicas, { id: "org-3", title: "Sem Letra", artist: "C", key: "C", capo: "", blocos: [{ l: "", c: "C  G" }] }).songs;
      songRepository.save(musicas);
      document.getElementById("modal-overlay").style.display = "flex"; openSummaryOrganizer();
    }, SHEET);
    await page.locator(".summary-organizer-item").first().waitFor();
    assert.deepEqual(sent, ["org-1"], "só manda ao servidor quem está fora do padrão e pode ser remontada");
    assert.equal(await page.locator(".summary-organizer-item").count(), 1);
    assert.match(await page.locator(".summary-organizer-compare").innerText(), /Primeira linha do verso aqui/);
    const missing = await page.locator(".summary-organizer-missing").innerText();
    assert.match(missing, /Complete a cifra primeiro \(1\)/, "lista quem precisa completar a cifra antes");
    assert.match(missing, /Sem Letra/); assert.ok(!/Já Bonita/.test(missing));
    const untouched = await page.evaluate(() => songRepository.load().find((song) => song.id === "org-1").blocos.map((b) => b.c).join("|"));
    assert.ok(!/Primeira linha/.test(untouched), "nada é salvo antes de confirmar");
    await page.locator(".summary-organizer-save").click();
    const saved = await page.evaluate(() => { const song = songRepository.load().find((item) => item.id === "org-1"); return { c: song.blocos.map((b) => b.c).join("|"), capo: song.capo, key: song.key, full: song.fullChordSheet?.content || "" }; });
    assert.match(saved.c, /Fm\s+Db9\|?.*Primeira linha do verso aqui/s);
    assert.match(saved.c, /Bbm\s+Db9\s+Fm\s+Cm\s+\(2x\)/);
    assert.equal(saved.key, "Fm", "tom mantido"); assert.match(saved.capo, /2/, "capo mantido"); assert.match(saved.full, /Primeira linha do verso aqui/, "Letra + Cifras mantida");
    console.log("summary-organizer-ui.test.js: OK (filtra, mostra antes/depois, só salva confirmando, mantém tom/capo/letra)");
  } finally {
    await browser.close(); server.close();
  }
})().catch((error) => { console.error(error); process.exit(1); });
