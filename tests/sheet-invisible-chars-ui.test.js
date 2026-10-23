// Cifra vinda da web com caracteres invisíveis (espaço de largura zero, espaço não separável, BOM):
// os acordes precisam continuar na cor da cifra e "[Refrão]" precisa virar título de seção.
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

const ZW = "\u200b", NB = "\u00a0", BOM = "\ufeff";
const CONTENT = `[Intro] C7M  D9  Bm7  C7M\n\n${ZW}[Primeira Parte]\n\n${NB}${NB}${NB}${NB}C7M${ZW}\nEu poderia estar\n                 D9${ZW}\nEm qualquer outro lugar\n${ZW}\n${BOM}[Refrão]\n\nC7M\tD9\nLinha do refrão`;

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
    await page.waitForFunction(() => typeof window.renderFullChordSheet === "function" && window.songFormat);
    // Texto puro (sem seções estruturadas), como fica uma música já salva.
    const raw = await page.evaluate((content) => {
      const box = document.createElement("div");
      box.innerHTML = renderFullChordSheet({ content, sections: [] }, 0, "x");
      const lines = [...box.querySelectorAll(".full-chord-line")].map((el) => ({ text: el.textContent.trim(), chord: el.classList.contains("is-chord"), section: el.classList.contains("is-section") }));
      return lines.filter((line) => line.text);
    }, CONTENT);
    const find = (text) => raw.find((line) => line.text.replace(/\s+/g, " ") === text);
    assert.ok(find("D9")?.chord, "D9 com caractere invisível continua acorde (cor da cifra)");
    assert.ok(find("C7M")?.chord, "C7M com espaço não separável continua acorde");
    assert.ok(find("C7M D9")?.chord, "tab entre acordes continua linha de acordes");
    assert.ok(find("Refrão")?.section, "[Refrão] com BOM vira título de seção");
    assert.ok(find("Primeira Parte")?.section, "[Primeira Parte] com espaço invisível vira título de seção");
    assert.ok(find("Intro")?.section && find("C7M D9 Bm7 C7M")?.chord, "[Intro] + acordes: título e acordes separados");
    assert.ok(find("Eu poderia estar") && !find("Eu poderia estar").chord, "letra continua letra");
    assert.ok(!raw.some((line) => /[\u200b\ufeff\u00a0]/.test(line.text)), "nada de caractere invisível na tela");

    // Seções estruturadas com linhas que ficaram como texto (acorde e seção dentro de "letra").
    const structured = await page.evaluate(() => {
      const box = document.createElement("div");
      box.innerHTML = renderFullChordSheet({ content: "x", sections: [{ nome: "Verso", linhas: [
        { letra: "                 D9\u200b", acordes: [] }, { letra: "Em qualquer outro lugar", acordes: [] }, { letra: "[Refrão]", acordes: [] }] }] }, 0, "x");
      return [...box.querySelectorAll(".full-chord-line")].map((el) => ({ text: el.textContent.trim(), chord: el.classList.contains("is-chord"), section: el.classList.contains("is-section") }));
    });
    assert.ok(structured.find((line) => line.text === "D9")?.chord, "acorde dentro de letra estruturada fica na cor da cifra");
    assert.ok(structured.find((line) => line.text === "Refrão")?.section, "[Refrão] dentro de letra estruturada vira seção");
    console.log("sheet-invisible-chars-ui.test.js: OK (acordes na cor da cifra e seções mesmo com caracteres invisíveis)");
  } finally {
    await browser.close(); server.close();
  }
})().catch((error) => { console.error(error); process.exit(1); });
