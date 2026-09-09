const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

const projectRoot = path.resolve(__dirname, "..");
const backupSongs = Array.from({ length: 138 }, (_, index) => ({
  id: `restore-ui-${index + 1}`,
  title: `Backup ${String(index + 1).padStart(3, "0")}`,
  artist: "Artista de teste",
  key: "C#m",
  originalKey: "C#m",
  capo: "Capotraste casa 2",
  blocos: [{ l: "Frase-gancho", c: "C#m  B2  A9", repeticoes: 2, progressao: ["C#m", "B2", "A9"] }],
  editorData: { sections: [{ type: "chorus", lines: [{ lyrics: "Frase-gancho", chords: [{ chord: "C#m", position: 0 }] }] }] },
  fullChordSheet: { visibility: "private", source: "user_upload", content: "REFRÃO\nC#m  B2  A9\nFrase-gancho", sections: [{ nome: "Refrão", linhas: [{ letra: "Frase-gancho", acordes: [{ acorde: "C#m", posicao: 0 }, { acorde: "B2", posicao: 6 }, { acorde: "A9", posicao: 11 }] }] }] },
  harmonicSummary: { key: "C#m", blocks: [{ section: "Refrão", chords: ["C#m", "B2", "A9"], hook: "Frase-gancho", repetitions: 2 }] },
  librarySync: { clientId: `restore-client-${index + 1}`, serverVersion: null, syncedAt: null, contentHash: "" },
  futureField: { preserved: true }
}));
const backup = JSON.stringify({ formato: "simplificando-cifras-exportacao", versao: 1, origens: { sessaoAtual: { musicas: backupSongs } } });

const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, "http://localhost").pathname;
  const relativePath = pathname === "/" ? "index.html" : decodeURIComponent(pathname.slice(1));
  const filePath = path.resolve(projectRoot, relativePath);
  if (!filePath.startsWith(projectRoot) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) return response.writeHead(404).end("Not found");
  const types = { ".html": "text/html; charset=utf-8", ".js": "application/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".webmanifest": "application/manifest+json; charset=utf-8", ".png": "image/png" };
  response.writeHead(200, { "Content-Type": types[path.extname(filePath)] || "application/octet-stream" });
  fs.createReadStream(filePath).pipe(response);
});

(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const executablePath = [process.env.BROWSER_EXECUTABLE, "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"].find((candidate) => candidate && fs.existsSync(candidate));
  const browser = await chromium.launch({ headless: true, executablePath });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript(() => {
    localStorage.setItem("sc_songs_v1", "[]");
    localStorage.setItem("cifras_musicas_v1", "[]");
    localStorage.setItem("cifras_setlists_v1", '[{"id":"evento-intacto","title":"Evento intacto"}]');
  });
  const page = await context.newPage();
  await page.route("https://fonts.googleapis.com/**", (route) => route.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await page.route("http://127.0.0.1:5000/api/auth/config", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ enabled: false, provider: "local" }) }));
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: "domcontentloaded" });
    assert.equal(await page.locator(".music-item").count(), 0);
    await page.getByRole("button", { name: "Sincronização", exact: true }).click();
    const chooserPromise = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Restaurar backup", exact: true }).click();
    const chooser = await chooserPromise;
    await chooser.setFiles({ name: "biblioteca-138.json", mimeType: "application/json", buffer: Buffer.from(backup) });
    await page.getByText("Backup encontrado", { exact: true }).waitFor();
    assert.match(await page.locator("#modal-body").innerText(), /138 músicas[\s\S]*Neste dispositivo\s*0[\s\S]*Novas\s*138[\s\S]*Já existentes\s*0[\s\S]*Conflitos\s*0/);
    await page.getByRole("button", { name: "Restaurar", exact: true }).click();
    assert.equal(await page.locator(".music-item").count(), 138);
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("sc_songs_v1")).length), 138);
    assert.equal(await page.evaluate(() => localStorage.getItem("cifras_setlists_v1")), '[{"id":"evento-intacto","title":"Evento intacto"}]');
    await page.getByRole("button", { name: "Fechar", exact: true }).click();

    await page.getByText("Backup 001", { exact: true }).click();
    await page.getByRole("tab", { name: "Letra + Cifras", exact: true }).click();
    assert.match(await page.locator("#view-detail").innerText(), /C#m\s+B2\s+A9/);
    assert.match(await page.locator("#view-detail").innerText(), /Frase-gancho/);
    await page.getByRole("button", { name: "Modo Palco", exact: true }).click();
    assert.ok(await page.locator("#view-detail").evaluate((element) => element.classList.contains("stage-mode")));
    assert.match(await page.locator("#view-detail").innerText(), /C#m\s+B2\s+A9/);
    await page.getByRole("button", { name: "Sair do Modo Palco", exact: true }).click();
    await page.locator(".back-btn").first().click();

    await page.getByRole("button", { name: "Sincronização", exact: true }).click();
    const repeatChooserPromise = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Restaurar backup", exact: true }).click();
    const repeatChooser = await repeatChooserPromise;
    await repeatChooser.setFiles({ name: "biblioteca-138.json", mimeType: "application/json", buffer: Buffer.from(backup) });
    assert.match(await page.locator("#modal-body").innerText(), /Novas\s*0[\s\S]*Já existentes\s*138[\s\S]*Conflitos\s*0/);
    await page.getByRole("button", { name: "Restaurar", exact: true }).click();
    assert.equal(await page.locator(".music-item").count(), 138);
    console.log("library-backup-restore-ui.test.js: OK (138 músicas, revisão, restauração, amostra, palco e idempotência)");
  } finally {
    await context.close();
    await browser.close();
    server.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
