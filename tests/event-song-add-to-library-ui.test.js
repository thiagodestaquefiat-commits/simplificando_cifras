// "Adicionar à playlist" no menu da música do evento: o convidado que não tem a música
// passa a ter uma cópia na biblioteca pessoal (antes o botão só mostrava a mensagem).
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

(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({ headless: true, executablePath });
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" })).newPage();
  page.on("dialog", (dialog) => dialog.accept());
  await page.route("**/api/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ bands: [], events: [], songs: [] }) }));
  await page.route("https://fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: "domcontentloaded" });
  try {
    await page.waitForFunction(() => typeof window.eventSongMenuAddPlaylist === "function" && window.eventModel && window.homePlaylists);
    const first = await page.evaluate(() => {
      const uid = String(appCurrentUser.id);
      const event = eventModel.create({
        id: "event_guest", title: "Culto", leaderId: "lider-1", remoteVersion: 2, syncState: "synced", pendingShared: false,
        members: [{ id: "lider-1", name: "Thiago", role: "Violão", isLeader: true }, { id: uid, name: "Fábio", role: "Guitarra" }],
        repertoire: [{ id: "rep_1", songId: "song-do-lider", order: 0, shared: { title: "Me Atraiu", artist: "Gabriela Rocha", key: "G", capo: "", chordSheet: "", notes: "",
          songData: { id: "song-do-lider", title: "Me Atraiu", artist: "Gabriela Rocha", key: "G", blocos: [{ l: "Eu poderia estar", c: "C7M  D9  Bm7" }],
            fullChordSheet: { visibility: "private", source: "web_source", content: "[Primeira Parte]\nC7M\nEu poderia estar", sections: [] } } } }]
      });
      setlists = [event]; eventRepository.save(setlists);
      const before = musicas.filter((song) => song.title === "Me Atraiu").length;
      eventSongMenuState = { eventId: "event_guest", itemId: "rep_1", trigger: null };
      eventSongMenuAddPlaylist();
      const saved = musicas.filter((song) => song.title === "Me Atraiu");
      return { before, count: saved.length, song: saved[0] && { title: saved[0].title, artist: saved[0].artist, blocos: saved[0].blocos, full: saved[0].fullChordSheet?.content || "" },
        stored: songRepository.load().some((song) => song.title === "Me Atraiu") };
    });
    assert.equal(first.before, 0);
    assert.equal(first.count, 1, "a música entra na biblioteca de quem tocou");
    assert.equal(first.song.artist, "Gabriela Rocha");
    assert.match(first.song.blocos.map((block) => block.c).join(" "), /C7M\s+D9\s+Bm7/, "com os acordes do evento");
    assert.match(first.song.full, /Eu poderia estar/, "com a letra e cifra");
    assert.ok(first.stored, "fica salva no aparelho (e entra na sincronização da conta)");
    await page.getByText("＋ Nova playlist").waitFor({ timeout: 5000 });
    const second = await page.evaluate(() => {
      closeEventAdminSheet?.();
      eventSongMenuState = { eventId: "event_guest", itemId: "rep_1", trigger: null };
      eventSongMenuAddPlaylist();
      return musicas.filter((song) => song.title === "Me Atraiu").length;
    });
    assert.equal(second, 1, "tocar de novo não duplica");
    console.log("event-song-add-to-library-ui.test.js: OK (convidado salva a música do evento na biblioteca e escolhe a playlist; sem duplicar)");
  } finally {
    await browser.close(); server.close();
  }
})().catch((error) => { console.error(error); process.exit(1); });
