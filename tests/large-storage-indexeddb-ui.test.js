// Armazenamento grande (26/11): eventos e biblioteca da conta saem do localStorage (~5 MB) para o IndexedDB.
// Testa num navegador real: migração sem perda, localStorage liberado, recarregar mantém os dados,
// gravação com a memória do localStorage cheia e gravação rápida (sem travar a tela).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  const file = path.resolve(root, pathname === '/' ? 'index.html' : pathname.slice(1));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return response.writeHead(404).end();
  response.setHeader('Content-Type', ({'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml'})[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(response);
});
const EVENTS = 'sc_personal_event_caches_v1', SONGS = 'sc_personal_song_caches_v1';
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/`;
  const executablePath = [process.env.BROWSER_EXECUTABLE, 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].find(value => value && fs.existsSync(value));
  const browser = await chromium.launch({ headless: true, executablePath });
  try {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    const page = await context.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort());
    // 1. Aparelho antigo: caches da conta no localStorage, do tamanho real (~2,4 MB + ~1,7 MB de texto).
    await page.goto(url + 'service-worker.js');
    const sizes = await page.evaluate(({ EVENTS, SONGS }) => {
      const song = i => ({ id: 's' + i, title: 'Louvor ' + i, fullChordSheet: { content: 'A E F#m D\n'.repeat(500) + 'Letra da música '.repeat(300) } });
      const events = { owner: Array.from({ length: 41 }, (_, e) => ({ id: 'ev' + e, title: 'Culto ' + e, repertoire: Array.from({ length: 5 }, (_, r) => ({ id: 'r' + r, songId: 's' + r, shared: { songData: song(r) } })) })) };
      const songs = { owner: Array.from({ length: 225 }, (_, i) => song(i)) };
      localStorage.clear(); localStorage.setItem(EVENTS, JSON.stringify(events)); localStorage.setItem(SONGS, JSON.stringify(songs)); localStorage.setItem('sc_prefs', '"ok"');
      return { events: localStorage.getItem(EVENTS).length, songs: localStorage.getItem(SONGS).length };
    }, { EVENTS, SONGS });
    assert.ok(sizes.events > 1500000 && sizes.songs > 1500000, 'dados de teste do tamanho real');
    await page.goto(url);
    await page.waitForFunction(() => window.storage && window.storage.largeMode() === 'idb', null, { timeout: 15000 }); await page.evaluate(() => window.storage.ready);
    const migrated = await page.evaluate(({ EVENTS, SONGS }) => ({
      lsEvents: localStorage.getItem(EVENTS), lsSongs: localStorage.getItem(SONGS), prefs: localStorage.getItem('sc_prefs'),
      events: storage.get(EVENTS, null), songs: storage.get(SONGS, null) }), { EVENTS, SONGS });
    assert.equal(migrated.lsEvents, null, 'eventos saíram do localStorage');
    assert.equal(migrated.lsSongs, null, 'biblioteca saiu do localStorage');
    assert.equal(migrated.prefs, '"ok"', 'o resto do localStorage continua igual');
    assert.equal(migrated.events.owner.length, 41, 'os 41 eventos continuam');
    assert.equal(migrated.songs.owner.length, 225, 'as 225 músicas continuam');
    assert.equal(migrated.events.owner[40].repertoire[4].shared.songData.title, 'Louvor 4', 'conteúdo intacto');

    // 1b. Aparelho lotado (como o PC e o celular do Thiago): antes da migração, não cabe nem o "crachá" do
    //     login. Depois de abrir o app, os caches saem do localStorage e o login volta a ter espaço.
    {
      const full = await browser.newContext({ serviceWorkers: 'block' }), other = await full.newPage();
      await other.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort());
      const data = await page.evaluate(({ EVENTS, SONGS }) => ({ events: localStorage.getItem(EVENTS) || JSON.stringify(storage.get(EVENTS, null)), songs: JSON.stringify(storage.get(SONGS, null)) }), { EVENTS, SONGS });
      await other.goto(url + 'service-worker.js');
      const lotado = await other.evaluate(({ EVENTS, SONGS, data }) => {
        localStorage.setItem(EVENTS, data.events); localStorage.setItem(SONGS, data.songs);
        const chunk = 'y'.repeat(500000); try { for (let k = 0; k < 40; k++) localStorage.setItem('outros_' + k, chunk); } catch (_) {}
        const small = 'y'.repeat(20000); try { for (let k = 0; k < 400; k++) localStorage.setItem('miudo_' + k, small); } catch (_) {}
        let cabeAntes = true; try { localStorage.setItem('sb-teste-auth-token', 'x'.repeat(20000)); localStorage.removeItem('sb-teste-auth-token'); } catch (_) { cabeAntes = false; }
        return { cabeAntes };
      }, { EVENTS, SONGS, data });
      assert.equal(lotado.cabeAntes, false, 'cenário reproduz o aparelho lotado (login não cabe)');
      await other.goto(url);
      await other.waitForFunction(() => window.storage && window.storage.largeMode() === 'idb', null, { timeout: 15000 }); await other.evaluate(() => window.storage.ready);
      const depois = await other.evaluate(({ EVENTS }) => { let cabe = true; try { localStorage.setItem('sb-teste-auth-token', 'x'.repeat(20000)); localStorage.removeItem('sb-teste-auth-token'); } catch (_) { cabe = false; } return { cabe, eventos: storage.get(EVENTS, {}).owner.length }; }, { EVENTS });
      assert.equal(depois.cabe, true, 'depois da migração o login tem espaço para gravar');
      assert.equal(depois.eventos, 41, 'nenhum evento perdido na migração do aparelho lotado');
      const usage = await other.evaluate(() => window.storage.measure());
      assert.equal(usage.mode, 'idb', 'medição registra o armazenamento grande em uso');
      assert.ok(usage.largeChars > 1500000, 'medição enxerga os caches grandes');
      await full.close();
    }

    // 2. Com o localStorage cheio, adicionar música a um evento (gravar o cache) funciona.
    const write = await page.evaluate(({ EVENTS }) => {
      try { for (let k = 0; k < 400; k++) localStorage.setItem('enchendo_' + k, 'y'.repeat(200000)); } catch (_) {}
      const caches = storage.get(EVENTS, {});
      caches.owner[0].repertoire.push({ id: 'novo', songId: 's9', shared: { songData: { id: 's9', title: 'Música nova' } } });
      const started = performance.now(); const ok = storage.set(EVENTS, caches); const ms = performance.now() - started;
      return { ok, ms, back: storage.get(EVENTS, {}).owner[0].repertoire.length };
    }, { EVENTS });
    assert.equal(write.ok, true, 'grava com o localStorage cheio');
    assert.equal(write.back, 6, 'a música nova aparece na hora');
    console.log(`  gravação do cache de eventos: ${Math.round(write.ms)} ms`);
    await page.evaluate(() => storage.flush());
    await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('enchendo_')).forEach(k => localStorage.removeItem(k)));

    // 3. Recarregar: os dados vêm do IndexedDB, com a música nova.
    await page.reload();
    await page.waitForFunction(() => window.storage && window.storage.largeMode() === 'idb'); await page.evaluate(() => window.storage.ready);
    const after = await page.evaluate(({ EVENTS, SONGS }) => ({ events: storage.get(EVENTS, {}), songs: storage.get(SONGS, {}), ls: localStorage.getItem(EVENTS) }), { EVENTS, SONGS });
    assert.equal(after.events.owner[0].repertoire.length, 6, 'a música nova continua depois de recarregar');
    assert.equal(after.songs.owner.length, 225);
    assert.equal(after.ls, null, 'nada volta para o localStorage');

    // 4. Remover (sair da conta) também vale no IndexedDB.
    await page.evaluate(({ SONGS }) => { storage.remove(SONGS); return storage.flush(); }, { SONGS });
    await page.reload();
    await page.waitForFunction(() => window.storage && window.storage.largeMode() === 'idb'); await page.evaluate(() => window.storage.ready);
    assert.equal(await page.evaluate(({ SONGS }) => storage.get(SONGS, 'vazio'), { SONGS }), 'vazio', 'remover apaga do armazenamento grande');
    assert.deepEqual(errors, [], 'sem erros de página');
    await context.close();
    console.log('large-storage-indexeddb-ui.test.js: OK');
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
