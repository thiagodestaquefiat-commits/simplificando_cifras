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
  const types = { ".html": "text/html; charset=utf-8", ".js": "application/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".webmanifest": "application/manifest+json; charset=utf-8", ".png": "image/png" };
  response.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(response);
});

async function assertSimpleEditor(page, id, expectedTitle) {
  await page.evaluate((songId) => openDetail(songId), id);
  await page.getByRole("button", { name: "Editar cifra", exact: true }).click();
  await page.getByText(/Editar música|Revisar resumo harmônico/, { exact: true }).waitFor({ state: "visible" });
  assert.equal(await page.getByLabel("Título", { exact: true }).inputValue(), expectedTitle);
  for (const label of ["Artista", "Tom original", "Capotraste", "Cifra / Resumo"]) assert.equal(await page.getByLabel(label, { exact: true }).count(), 1, label);
  assert.equal(await page.locator("#song-editor").count(), 0);
  for (const forbidden of ["Tipo", "Nome da seção", "Posição do acorde", "Instrumento", "BPM", "Simplificar acordes", "Restaurar versão inicial", "Duplicar seção"]) assert.equal(await page.getByText(forbidden, { exact: true }).count(), 0, forbidden);
  assert.ok((await page.getByLabel("Cifra / Resumo", { exact: true }).boundingBox()).height >= 300);
}

(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({ headless: true, executablePath });
  try {
    for (const viewport of [{ width: 390, height: 844 }, { width: 1366, height: 768 }]) {
      const context = await browser.newContext({ viewport, serviceWorkers: "block" });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
      await page.route("https://fonts.googleapis.com/**", (route) => route.fulfill({ status: 200, contentType: "text/css", body: "" }));
      await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: "domcontentloaded" });
      await page.evaluate(() => {
        musicas.push(
          songModel.create({ id: "na-sua-estante", title: "Na Sua Estante", artist: "Pitty", key: "C", blocos: [] }),
          songModel.create({ id: "ia-song", title: "Música da IA", artist: "Artista IA", key: "G", aiGenerated: true, blocos: [{ l: "Refrão", c: "Frase-gancho da IA\nG D Em C  (3x)" }] }),
          songModel.create({ id: "spotify-song", title: "Música Spotify", artist: "Artista Spotify", album: "Álbum teste", coverUrl: "https://example.test/cover.jpg", spotifyTrackId: "track-123", spotifyUri: "spotify:track:track-123", isrc: "BRABC1234567", duration: 234000, key: "A", blocos: [{ l: "Verso", c: "A E F#m D" }] })
        );
        setlists.push({ id: "ref-test", title: "Referência", musicas: ["spotify-song"] });
        renderMusicas();
      });

      for (const [id, title] of [[45, "Liberta-me de mim"], [4, "Além do impossível"], ["na-sua-estante", "Na Sua Estante"], ["ia-song", "Música da IA"], ["spotify-song", "Música Spotify"]]) {
        await assertSimpleEditor(page, id, title);
        await page.getByRole("button", { name: "Cancelar", exact: true }).click();
        await page.evaluate(() => closeDetail());
      }

      await assertSimpleEditor(page, "spotify-song", "Música Spotify");
      await page.getByLabel("Título", { exact: true }).fill("Música Spotify revisada");
      await page.getByLabel("Artista", { exact: true }).fill("Artista preservado");
      await page.getByLabel("Tom original", { exact: true }).fill("Bb");
      await page.getByLabel("Capotraste", { exact: true }).fill("2");
      await page.getByLabel("Cifra / Resumo", { exact: true }).fill("Verso\nFrase curta\nBb F Gm Eb  (2x)\n\nFinal\nEb F Bb");
      await page.getByRole("button", { name: "Salvar", exact: true }).click();
      const saved = await page.evaluate(() => ({ song: musicas.find((item) => item.id === "spotify-song"), referenced: setlists.some((setlist) => setlist.musicas.includes("spotify-song")) }));
      assert.equal(saved.song.id, "spotify-song");
      assert.equal(saved.song.spotifyTrackId, "track-123");
      assert.equal(saved.song.spotifyUri, "spotify:track:track-123");
      assert.equal(saved.song.album, "Álbum teste");
      assert.equal(saved.song.coverUrl, "https://example.test/cover.jpg");
      assert.equal(saved.song.isrc, "BRABC1234567");
      assert.equal(saved.song.duration, 234000);
      assert.equal(saved.song.originalKey, "Bb");
      assert.equal(saved.song.capo, "Capotraste casa 2");
      assert.equal(saved.song.editorData.sections[0].lines[0].lyrics, "Frase curta");
      assert.equal(saved.song.editorData.sections[0].lines[0].repeticoes, 2);
      assert.equal(saved.referenced, true);
      assert.match(await page.locator("#detail-content").innerText(), /Frase curta/);
      await page.locator(".transpose-bar .t-btn").last().click();
      assert.equal(await page.locator("#transposed-key").innerText(), "B");

      await page.getByRole("button", { name: "Editar cifra", exact: true }).click();
      await page.getByLabel("Título", { exact: true }).fill("Não salvar");
      await page.getByRole("button", { name: "Cancelar", exact: true }).click();
      assert.equal(await page.evaluate(() => musicas.find((item) => item.id === "spotify-song").title), "Música Spotify revisada");
      assert.equal(errors.length, 0, errors.join(" | "));
      await context.close();
    }
    console.log("song-editor-ui.test.js: OK (editor simples universal, preservação Song/Spotify, referências, cancelamento e transposição)");
  } finally {
    await browser.close();
    server.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
