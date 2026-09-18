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
      assert.equal(await page.locator('#study-metronome').isVisible(), true);
      assert.equal(await page.locator('#btn-palco').isVisible(), false);
      assert.equal(await page.locator('#study-metronome').evaluate(element => element.parentElement.id), 'capo-row');
      const bounds = await page.locator('#study-metronome').boundingBox();
      const scrollBounds = await page.locator('#study-scroll-toolbar').boundingBox();
      assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width, `metrônomo deve caber em ${width}px`);
      assert.ok(bounds.height <= 60, 'metrônomo deve ocupar uma linha');
      assert.ok(bounds.y + bounds.height <= scrollBounds.y + 1, 'metrônomo deve aparecer acima da rolagem');
      assert.equal(await page.locator('#transposed-key').evaluate(element => element.closest('#chord-diagrams-section') !== null), true);
      assert.equal(await page.locator('#capo-row').evaluate(element => element.closest('#study-music-panel') !== null), true);
      await page.locator('#study-panel-toggle').click();
      assert.equal(await page.locator('#study-panel-toggle').getAttribute('aria-expanded'), 'false');
      assert.equal(await page.locator('#chord-strip').isVisible(), false);
      assert.equal(await page.locator('#capo-row').isVisible(), false);
      assert.equal(await page.locator('.chord-transpose-controls').isVisible(), false);
      assert.equal(await page.locator('#study-scroll-toolbar').isVisible(), true);
      await page.locator('#study-panel-toggle').click();
      assert.equal(await page.locator('#study-panel-toggle').getAttribute('aria-expanded'), 'true');
      assert.equal(await page.locator('#study-metronome').isVisible(), true);
      await page.locator('#metronome-plus').click();
      assert.equal(await page.locator('#metronome-bpm').innerText(), '73');
      await page.locator('#metronome-meter').selectOption('3/4');
      assert.equal(await page.locator('.metronome-beat:visible').count(), 3);
      await page.locator('#metronome-meter').selectOption('6/8');
      assert.equal(await page.locator('.metronome-beat:visible').count(), 6);
      await page.locator('#metronome-meter').selectOption('3/4');
      await page.locator('#metronome-play').click();
      await page.waitForFunction(() => studyMetronome.isPlaying());
      await page.locator('#metronome-play').click();
      assert.equal(await page.evaluate(() => studyMetronome.isPlaying()), false);
      await page.evaluate(() => { closeDetail(); openDetail(1); });
      assert.equal(await page.locator('#metronome-bpm').innerText(), '73');
      assert.equal(await page.locator('#metronome-meter').inputValue(), '3/4');
      await page.evaluate(() => {
        setlists.push(eventModel.create({ id: 'metronome-event', title: 'Ensaio', musicas: [1], members: [{ ...appCurrentUser, isLeader: true }], leaderId: appCurrentUser.id }));
        openDetailFromPlaylist('metronome-event', 0);
      });
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
