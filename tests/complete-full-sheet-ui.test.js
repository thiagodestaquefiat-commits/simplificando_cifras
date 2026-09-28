// Completar música que só tem resumo harmônico com Letra + Cifras (digitada ou por arquivo).
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
  await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: "domcontentloaded" });
  try {
    await page.waitForFunction(() => typeof window.openSimpleSongEditor === "function" && Array.isArray(window.musicas || musicas));
    // Música só com resumo harmônico.
    const id = await page.evaluate(() => {
      const song = { id: "resumo-only-1", title: "Só Resumo", artist: "Artista", key: "C", capo: "", blocos: [{ l: "Refrão", c: "C  G  Am  F" }] };
      musicas = songRepository.addOrReuse(musicas, song).songs; salvar(); renderMusicas();
      return musicas.find((m) => m.title === "Só Resumo").id;
    });
    await page.evaluate((songId) => editMusica(songId), id);
    await page.getByText("Esta música só tem o resumo harmônico.").waitFor();
    await page.locator("[data-simple-editor-view=full]").click();
    const textarea = page.locator("#ai-review-full-text");
    assert.equal(await textarea.inputValue(), "");
    assert.equal(await page.locator("#full-sheet-attach").innerText(), "📎 Anexar arquivo ou foto");
    // Anexa TXT: lido no aparelho, sem chamar o servidor.
    let serverCalls = 0;
    await page.route("**/api/resumo-harmonico", (r) => { serverCalls += 1; return r.abort(); });
    await page.locator("#full-sheet-file").setInputFiles({ name: "cifra.txt", mimeType: "text/plain", buffer: Buffer.from(SHEET) });
    await page.getByText("Arquivo carregado. Revise e toque em Salvar.").waitFor();
    assert.equal(await textarea.inputValue(), SHEET);
    assert.equal(serverCalls, 0);
    // Resumo harmônico continua igual.
    assert.match(await page.locator("#ai-review-text").inputValue(), /C\s+G\s+Am\s+F/);
    await page.getByRole("button", { name: "Salvar", exact: true }).click();
    const saved = await page.evaluate((songId) => musicas.find((m) => String(m.id) === String(songId)), id);
    assert.equal(saved.fullChordSheet.content, SHEET);
    assert.equal(saved.fullChordSheet.source, "user_upload");
    assert.ok(saved.blocos.length >= 1, "resumo harmônico mantido");
    // Detalhe passa a ter a visualização Letra + Cifras.
    await page.getByRole("tab", { name: "Letra + Cifras" }).first().waitFor();
    // Reabrir: aba já preenchida, sem o aviso de "só resumo".
    await page.evaluate((songId) => editMusica(songId), id);
    assert.equal(await page.getByText("Esta música só tem o resumo harmônico.").count(), 0);
    assert.equal(await page.locator("#ai-review-full-text").inputValue(), SHEET);
    // Editar à mão mantém a cifra como conteúdo do próprio usuário.
    await page.locator("[data-simple-editor-view=full]").click();
    await page.locator("#ai-review-full-text").fill(SHEET + "\nTerceira linha");
    await page.getByRole("button", { name: "Salvar", exact: true }).click();
    const edited = await page.evaluate((songId) => musicas.find((m) => String(m.id) === String(songId)), id);
    assert.ok(["user_upload", "user_text"].includes(edited.fullChordSheet.source));
    assert.match(edited.fullChordSheet.content, /Terceira linha$/);
    console.log("complete-full-sheet-ui.test.js: OK (aba sempre visível, TXT local, resumo preservado, salvar e reabrir)");
  } finally {
    await browser.close(); server.close();
  }
})().catch((error) => { console.error(error); process.exit(1); });
