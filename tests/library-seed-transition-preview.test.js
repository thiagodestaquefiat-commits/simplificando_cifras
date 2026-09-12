const assert = require("node:assert/strict");
const { chromium } = require("playwright");

const previewUrl = process.env.ROUDY_PREVIEW_URL || "https://deploy-preview-44--simplificandocifras.netlify.app/";
const ownerA = "preview-seed-owner-a";
const ownerB = "preview-seed-owner-b";

function fixtureSong(index) {
  return {
    id: index + 1,
    title: `Biblioteca atual ${String(index + 1).padStart(3, "0")}`,
    artist: "Fixture isolada",
    key: "C",
    capo: "",
    blocos: [{ l: "Verso", c: "C  G", t: `Linha ${index + 1}` }],
    futureField: { preserved: true, index },
    librarySync: {
      clientId: `preview-seed-client-${index + 1}`,
      serverVersion: index < 86 ? 1 : null,
      syncedAt: index < 86 ? "2026-09-12T12:00:00.000Z" : null,
      contentHash: "",
      conflict: null
    }
  };
}

const fixture = Array.from({ length: 96 }, (_, index) => fixtureSong(index));
const remote = new Map([[ownerA, new Map(fixture.slice(0, 86).map((song, index) => [
  song.librarySync.clientId,
  {
    id: `remote-${index + 1}`,
    clientId: song.librarySync.clientId,
    songData: Object.fromEntries(Object.entries(song).filter(([key]) => key !== "librarySync")),
    version: 1,
    updatedAt: "2026-09-12T12:00:00.000Z",
    deletedAt: null
  }
]))]]);

function bearer(request) {
  return String(request.headers().authorization || "").replace(/^Bearer\s+/i, "");
}

async function configureContext(context, options) {
  await context.addInitScript(({ songs, initialOwner, withLocal }) => {
    if (withLocal && !localStorage.getItem("__roudy_preview_seed_fixture_v1")) {
      localStorage.setItem("__roudy_preview_seed_fixture_v1", "ready");
      localStorage.setItem("sc_songs_v1", JSON.stringify(songs));
      localStorage.setItem("cifras_musicas_v1", JSON.stringify(songs));
      localStorage.setItem("sc_seed_library_only_v1", "true");
      localStorage.setItem("sc_legacy_library_owner_v1", initialOwner);
      localStorage.setItem("sc_personal_song_caches_v1", JSON.stringify({ [initialOwner]: songs.slice(0, 86) }));
      localStorage.setItem("sc_musicas_v2", JSON.stringify([{ sentinel: "historical-storage" }]));
      localStorage.setItem("sc_song_editor_drafts_v1", JSON.stringify([{ sentinel: "draft-storage" }]));
      localStorage.setItem("sc_events_v1", JSON.stringify([{ id: "event-sentinel", title: "Evento intacto", repertoire: [] }]));
    }

    if (!sessionStorage.getItem("__roudy_preview_owner_v1")) {
      sessionStorage.setItem("__roudy_preview_owner_v1", initialOwner);
    }
    const sessionFor = (id) => id ? {
      access_token: id,
      user: { id, email: `${id}@example.test`, user_metadata: { name: id } }
    } : null;
    let currentSession = sessionFor(sessionStorage.getItem("__roudy_preview_owner_v1"));
    let authListener = () => {};
    window.__setPreviewOwner = (id) => {
      if (id) sessionStorage.setItem("__roudy_preview_owner_v1", id);
      else sessionStorage.removeItem("__roudy_preview_owner_v1");
      currentSession = sessionFor(id);
      authListener(id ? "SIGNED_IN" : "SIGNED_OUT", currentSession);
    };
    window.supabase = {
      createClient() {
        return { auth: {
          onAuthStateChange(callback) { authListener = callback; return { data: { subscription: { unsubscribe() {} } } }; },
          async getSession() { return { data: { session: currentSession }, error: null }; },
          async exchangeCodeForSession() { return { data: { session: currentSession }, error: null }; },
          async signOut() { window.__setPreviewOwner(null); return { error: null }; },
          async signInWithOAuth() { return { error: null }; }
        } };
      }
    };
  }, { songs: fixture, initialOwner: options.owner, withLocal: options.withLocal });

  await context.route("**/api/auth/config", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ enabled: true, provider: "supabase", supabaseUrl: "https://example.test", supabaseAnonKey: "preview-test" })
  }));
  await context.route("https://fonts.googleapis.com/**", (route) => route.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await context.route("**/api/collaboration/**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/me")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: bearer(route.request()), name: "Preview" }) });
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ events: [] }) });
  });
  await context.route("**/api/library/songs**", async (route) => {
    const request = route.request();
    const owner = bearer(request);
    const values = remote.get(owner) || new Map();
    remote.set(owner, values);
    const url = new URL(request.url());
    if (url.pathname.endsWith("/diagnostics")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ databaseDialect: "fixture", active: values.size }) });
    }
    if (request.method() === "GET") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ songs: [...values.values()] }) });
    }
    const body = request.postDataJSON();
    const results = body.items.map((item) => {
      const existing = values.get(item.clientId);
      const version = existing ? existing.version + (JSON.stringify(existing.songData) === JSON.stringify(item.songData) ? 0 : 1) : 1;
      const song = {
        id: existing?.id || `remote-${owner}-${values.size + 1}`,
        clientId: item.clientId,
        songData: item.songData,
        version,
        updatedAt: "2026-09-12T13:00:00.000Z",
        deletedAt: null
      };
      values.set(item.clientId, song);
      return { clientId: item.clientId, outcome: existing ? "existing" : "created", song };
    });
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ results }) });
  });
}

async function waitForCount(page, count) {
  await page.waitForFunction((expected) => document.getElementById("count-label")?.textContent === `${expected} músicas`, count, { timeout: 15000 });
}

async function waitForRemote(owner, count) {
  const deadline = Date.now() + 15000;
  while ((remote.get(owner)?.size || 0) !== count && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.equal(remote.get(owner)?.size || 0, count);
}

(async () => {
  const executablePath = process.env.BROWSER_EXECUTABLE || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  const browser = await chromium.launch({ headless: true, executablePath });
  let downloads = 0;
  try {
    const deviceA = await browser.newContext({ serviceWorkers: "block" });
    await configureContext(deviceA, { owner: ownerA, withLocal: true });
    const pageA = await deviceA.newPage();
    pageA.on("download", () => { downloads += 1; });
    await pageA.goto(previewUrl, { waitUntil: "domcontentloaded" });
    await waitForCount(pageA, 96);
    await waitForRemote(ownerA, 96);
    assert.deepEqual(await pageA.evaluate(() => JSON.parse(localStorage.getItem("sc_songs_v1")).map(song => song.id)), fixture.map(song => song.id));
    assert.deepEqual(await pageA.evaluate(() => JSON.parse(localStorage.getItem("sc_songs_v1")).map(song => song.librarySync.clientId)), fixture.map(song => song.librarySync.clientId));
    assert.equal(await pageA.evaluate(() => localStorage.getItem("sc_musicas_v2")), '[{"sentinel":"historical-storage"}]');
    assert.deepEqual(await pageA.evaluate(() => JSON.parse(localStorage.getItem("sc_events_v1")).map(event => ({ id: event.id, title: event.title, repertoire: event.repertoire }))), [{ id: "event-sentinel", title: "Evento intacto", repertoire: [] }]);

    await pageA.reload({ waitUntil: "domcontentloaded" });
    await waitForCount(pageA, 96);
    await pageA.evaluate((owner) => window.__setPreviewOwner(owner), ownerB);
    await waitForCount(pageA, 0);
    assert.equal(remote.get(ownerB)?.size || 0, 0);
    await pageA.evaluate((owner) => window.__setPreviewOwner(owner), ownerA);
    await waitForCount(pageA, 96);

    await deviceA.setOffline(true);
    assert.equal(await pageA.locator(".music-item").count(), 96);
    await deviceA.setOffline(false);
    await waitForCount(pageA, 96);

    const deviceB = await browser.newContext({ serviceWorkers: "block" });
    await configureContext(deviceB, { owner: ownerA, withLocal: false });
    const pageB = await deviceB.newPage();
    pageB.on("download", () => { downloads += 1; });
    await pageB.goto(previewUrl, { waitUntil: "domcontentloaded" });
    await waitForCount(pageB, 96);
    assert.equal(await pageB.locator(".music-item").count(), 96);
    assert.equal(downloads, 0, "login e migração não podem iniciar download JSON");
    await deviceB.close();
    await deviceA.close();
    console.log("library-seed-transition-preview.test.js: OK (Preview login → 96 → reload → B=0 → A=96 → offline → segundo dispositivo=96; zero downloads)");
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
