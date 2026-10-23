// Evento compartilhado aparecia vazio para o convidado: no servidor, os itens do repertório
// estavam sem a cópia da música (songData). O líder via as músicas porque elas estão na
// biblioteca dele; o convidado não tem essas músicas e o app escondia todos os itens.
// Agora, ao sincronizar, o líder envia as cópias que faltam no servidor.
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
    await page.waitForFunction(() => typeof window.syncEventsNow === "function" && window.eventCollaboration && window.eventModel);
    const result = await page.evaluate(async () => {
      const uid = String(appCurrentUser.id), saved = [];
      musicas = songRepository.addOrReuse(musicas, { id: "song-copy-1", title: "Música do Líder", artist: "Artista", key: "G", capo: "", blocos: [{ l: "Frase do verso", c: "G  D  Em  C" }] }).songs; salvar();
      const remoteEvent = (withCopy) => eventModel.create({
        id: withCopy ? "event_copy_ok" : "event_copy_missing", title: "Culto", leaderId: uid, remoteVersion: 3, syncState: "synced", pendingShared: false,
        members: [{ id: uid, name: "Líder", role: "Violão", isLeader: true }],
        repertoire: [{ id: "rep_1", songId: "song-copy-1", order: 0, shared: { title: "Música do Líder", artist: "Artista", key: "", capo: "", chordSheet: "", notes: "",
          ...(withCopy ? { songData: { id: "song-copy-1", title: "Música do Líder", artist: "Artista", key: "G", blocos: [{ l: "Frase do verso", c: "G  D  Em  C" }] } } : {}) } }]
      });
      let remote = [remoteEvent(false), remoteEvent(true)];
      const original = window.eventCollaboration;
      window.eventCollaboration = { ...original,
        ensureRegistered: async () => ({}), flushEventDeletionQueue: async () => [], flushPersonalQueue: async () => [],
        listEvents: async () => remote.map((event) => eventModel.create(event)),
        saveSharedEvent: async (event) => { saved.push(JSON.parse(JSON.stringify(event))); return eventModel.create({ ...event, remoteVersion: (event.remoteVersion || 0) + 1, syncState: "synced", pendingShared: false }); }
      };
      setlists = [];
      await syncEventsNow(true);
      const first = saved.map((event) => ({ id: event.id, songData: event.repertoire[0].shared.songData || null }));
      // Segunda sincronização: o servidor já tem a cópia, então não reenvia nada.
      remote = saved.map((event) => eventModel.create({ ...event, remoteVersion: 4 })).concat([remoteEvent(true)]);
      saved.length = 0;
      await syncEventsNow(true);
      window.eventCollaboration = original;
      return { first, second: saved.length };
    });
    assert.equal(result.first.length, 1, "envia só o evento que estava sem cópia");
    assert.equal(result.first[0].id, "event_copy_missing");
    assert.equal(result.first[0].songData?.title, "Música do Líder", "a cópia da música vai junto");
    assert.ok(result.first[0].songData?.blocos?.length, "com os acordes");
    assert.equal(result.second, 0, "depois de enviado, não fica reenviando");
    console.log("event-shared-song-copies-ui.test.js: OK (líder envia as cópias que faltavam; convidado deixa de ver evento vazio)");
  } finally {
    await browser.close(); server.close();
  }
})().catch((error) => { console.error(error); process.exit(1); });
