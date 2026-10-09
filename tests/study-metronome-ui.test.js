const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  const file = path.resolve(root, pathname === '/' ? 'index.html' : pathname.slice(1));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return response.writeHead(404).end();
  response.setHeader('Content-Type', ({ '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css' })[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(response);
});

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const executablePath = [process.env.BROWSER_EXECUTABLE, 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].find(file => file && fs.existsSync(file));
  const browser = await chromium.launch({ headless: true, executablePath });
  try {
    for (const width of [320, 390, 1366]) {
      const context = await browser.newContext({ viewport: { width, height: 844 }, serviceWorkers: 'block' });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/api/auth/config', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":false,"provider":"local"}' }));
      await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
      await page.goto(`http://127.0.0.1:${server.address().port}/`);
      await page.evaluate(() => openDetail(1));
      await page.locator('#song-controls-toggle').click();
      assert.equal(await page.locator('#study-metronome').isVisible(), true);
      assert.equal(await page.locator('#btn-palco').isVisible(), false);
      assert.equal(await page.locator('#study-metronome').evaluate(element => element.closest('#song-control-panel') !== null), true);
      assert.equal(await page.locator('#metronome-play').count(), 0, 'botão de play do metrônomo não deve ser exibido');
      assert.equal(await page.locator('.song-meter-wheel button').count(), 6);
      assert.equal(await page.locator('.song-meter-wheel button[aria-checked="true"]').count(), 0, 'metrônomo começa desativado');
      assert.equal(await page.locator('#song-metronome-toggle').getAttribute('aria-pressed'), 'false');
      const bounds = await page.locator('#study-metronome').boundingBox();
      assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width, `metrônomo deve caber em ${width}px`);
      assert.ok(bounds.height <= 130, 'metrônomo deve permanecer compacto mesmo quando quebra em telas estreitas');
      assert.equal(await page.locator('#transposed-key').evaluate(element => element.closest('#song-control-panel') !== null), true);
      assert.equal(await page.locator('#capo-selector-group').evaluate(element => element.closest('#song-control-panel') !== null), true);
      await page.locator('#study-panel-toggle').click();
      assert.equal(await page.locator('#study-panel-toggle').getAttribute('aria-expanded'), 'false');
      assert.equal(await page.locator('#chord-strip').isVisible(), false);
      assert.equal(await page.locator('#song-controls').isVisible(), true);
      await page.locator('#study-panel-toggle').click();
      assert.equal(await page.locator('#study-panel-toggle').getAttribute('aria-expanded'), 'true');
      assert.equal(await page.locator('#study-metronome').isVisible(), true);
      await page.locator('#metronome-plus').click();
      assert.equal(await page.locator('#metronome-bpm').innerText(), '73');
      await page.locator('#btn-scroll').click();
      assert.equal(await page.evaluate(() => studyMetronome.isPlaying()), false, 'play geral não inicia metrônomo sem compasso selecionado');
      await page.locator('#btn-scroll').click();
      await page.locator('.song-meter-wheel [data-meter="3/4"]').click();
      assert.equal(await page.locator('.metronome-beat:visible').count(), 3);
      await page.locator('.song-meter-wheel [data-meter="6/8"]').click();
      assert.equal(await page.locator('.metronome-beat:visible').count(), 6);
      await page.locator('.song-meter-wheel [data-meter="5/4"]').click();
      assert.equal(await page.locator('#song-control-meter').innerText(), '5/4');
      await page.locator('#song-metronome-toggle').click();
      assert.equal(await page.evaluate(() => studyMetronome.getMeter()), null, 'botão azul desativa o metrônomo no play geral');
      await page.locator('#song-metronome-toggle').click();
      assert.equal(await page.evaluate(() => studyMetronome.getMeter()), '5/4', 'botão azul restaura o último compasso');
      await page.locator('.song-meter-wheel [data-meter="3/4"]').click();
      assert.equal(await page.evaluate(() => studyMetronome.isPlaying()), false);
      await page.locator('#btn-scroll').click();
      await page.waitForFunction(() => studyMetronome.isPlaying());
      await page.locator('#btn-scroll').click();
      assert.equal(await page.evaluate(() => studyMetronome.isPlaying()), false, 'play de estudo controla também o metrônomo');
      await page.evaluate(() => { closeDetail(); openDetail(1); });
      assert.equal(await page.locator('#metronome-bpm').innerText(), '73');
      assert.equal(await page.locator('#metronome-meter').inputValue(), '3/4');
      await page.evaluate(() => {
        setlists.push(eventModel.create({ id: 'metronome-event', title: 'Ensaio', musicas: [1], members: [{ ...appCurrentUser, isLeader: true }], leaderId: appCurrentUser.id }));
        openDetailFromPlaylist('metronome-event', 0);
      });
      await page.locator('#song-controls-toggle').click();
      assert.equal(await page.locator('#btn-palco').isVisible(), true);
      await page.locator('#btn-palco').click();
      assert.equal(await page.locator('#study-metronome').isVisible(), false);
      assert.equal(await page.evaluate(() => studyMetronome.isPlaying()), false);
      assert.deepEqual(errors, []);
      await context.close();
    }
    console.log('study-metronome-ui: OK (uma linha, áudio, BPM salvo, palco por evento)');
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; server.close(); });
