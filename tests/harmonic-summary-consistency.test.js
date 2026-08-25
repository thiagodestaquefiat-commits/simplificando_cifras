const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const executablePath = [process.env.BROWSER_EXECUTABLE, "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"].find((candidate) => candidate && fs.existsSync(candidate));
const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, "http://localhost").pathname;
  const relative = pathname === "/" ? "index.html" : decodeURIComponent(pathname.slice(1));
  const file = path.resolve(root, relative);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return response.writeHead(404).end();
  const type = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".json": "application/json", ".webmanifest": "application/manifest+json" }[path.extname(file)] || "application/octet-stream";
  response.writeHead(200, { "Content-Type": type });
  fs.createReadStream(file).pipe(response);
});

async function snapshot(browser, baseUrl, viewport) {
  const context = await browser.newContext({ viewport, serviceWorkers: "block" });
  const page = await context.newPage();
  await page.route("https://fonts.googleapis.com/**", (route) => route.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  const result = await page.evaluate(() => {
    function structuredSong(id, title, artist, key, sections, aiGenerated) {
      const model = songFormat.normalize({ id, title, artist, originalKey: key, currentKey: key, source: aiGenerated ? "ai" : "manual", aiGenerated, sections });
      return songModel.create({ ...songFormat.toLegacy(model), id, blocos: [{ l: "Representação legada conflitante", c: "A B C" }] });
    }
    const fixtures = [
      structuredSong("na-sua-estante", "Na Sua Estante", "Pitty", "C", [
        { type: "intro", label: "Intro", lines: [{ lyrics: "Frase da estante", repeticoes: 2, chords: [{ chord: "C", position: 0 }, { chord: "G", position: 3 }, { chord: "Am", position: 6 }, { chord: "F", position: 9 }] }] }
      ], false),
      structuredSong("cultura-do-ceu", "Cultura do Céu", "Davi Fernandes", "C", [
        { type: "intro", label: "Intro", lines: [{ lyrics: "Aqui na terra", repeticoes: 3, chords: [{ chord: "F", position: 0 }, { chord: "Am", position: 3 }, { chord: "G", position: 7 }] }] },
        { type: "outro", label: "Final", lines: [{ lyrics: "", chords: [{ chord: "Am", position: 0 }, { chord: "G", position: 3 }, { chord: "Em", position: 6 }] }] }
      ], true),
      songModel.create({ id: "manual", title: "Manual", artist: "Equipe", key: "A", blocos: [{ l: "Refrão", c: "A E F#m D  (2x)\nFrase manual" }] }),
      structuredSong("ia", "Resumo da IA", "Equipe IA", "G", [
        { type: "chorus", label: "Refrão", lines: [{ lyrics: "Frase da IA", repeticoes: 4, chords: [{ chord: "G", position: 0 }, { chord: "D/F#", position: 3 }, { chord: "Em", position: 8 }, { chord: "C", position: 11 }] }] }
      ], true)
    ];
    musicas.push(...fixtures);
    const ids = [4, "na-sua-estante", "cultura-do-ceu", "manual", "ia"];
    return ids.map((id) => {
      const song = musicas.find((item) => String(item.id) === String(id));
      const semantic = songFormat.harmonicSummary(song);
      openDetail(id);
      const rendered = {
        title: document.getElementById("detail-title").textContent,
        artist: document.getElementById("detail-artist-label").textContent,
        key: document.getElementById("detail-key").textContent,
        blocks: [...document.querySelectorAll("#detail-content .wa-block")].map((block) => ({
          chords: [...block.querySelectorAll(".chord-line")].map((line) => line.textContent),
          lyrics: [...block.querySelectorAll(".letra-linha")].map((line) => line.textContent)
        }))
      };
      closeDetail();
      return { id: String(id), semantic, rendered };
    });
  });
  await context.close();
  return result;
}

(async () => {
  const previewUrl = process.env.PREVIEW_BASE_URL;
  if (!previewUrl) await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = previewUrl || `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch({ headless: true, executablePath });
  try {
    const viewports = [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1366, height: 768 }];
    const snapshots = [];
    for (const viewport of viewports) snapshots.push(await snapshot(browser, baseUrl, viewport));
    assert.deepEqual(snapshots[1], snapshots[0]);
    assert.deepEqual(snapshots[2], snapshots[0]);
    const oldSong = snapshots[0].find((item) => item.id === "4");
    assert.equal(oldSong.semantic.title, "Além do impossível");
    const manual = snapshots[0].find((item) => item.id === "manual");
    assert.equal(manual.semantic.sections[0].lines[0].repeticoes, 2);
    const estante = snapshots[0].find((item) => item.id === "na-sua-estante");
    assert.deepEqual(estante.semantic.sections[0].lines[0].chords.map((item) => item.chord), ["C", "G", "Am", "F"]);
    assert.doesNotMatch(JSON.stringify(estante), /Representação legada conflitante|"A","B","C"/);
    console.log("harmonic-summary-consistency.test.js: OK (5 origens semanticamente idênticas em 390x844, 768x1024 e 1366x768)");
  } finally {
    await browser.close();
    if (!previewUrl) server.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
