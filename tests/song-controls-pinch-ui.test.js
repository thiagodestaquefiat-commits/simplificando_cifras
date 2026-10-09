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
    for (const width of [320, 390, 1024]) {
      const context = await browser.newContext({ viewport: { width, height: 844 }, serviceWorkers: 'block' });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/api/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":false,"provider":"local"}' }));
      await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
      await page.goto(`http://127.0.0.1:${server.address().port}/`);
      await page.waitForFunction(()=>loginGateAuthReady);
      await page.evaluate(() => {continueWithoutLogin();if(!musicas.some(s=>s.id===1)){musicas.push(songModel.create({id:1,title:'Teste de controles',key:'C',blocos:Array.from({length:30},()=>({l:'Letra de teste',c:'C G Am F'}))}));commitSongs(musicas);}openDetail(1);});

      const controls = page.locator('#song-controls');
      assert.equal(await controls.isVisible(), true);
      assert.equal(await page.locator('#song-control-panel').isVisible(), false);
      assert.equal(await page.locator('#btn-font').count(), 0);
      assert.ok(await controls.evaluate(element => element.scrollWidth <= element.clientWidth), `control strip must fit ${width}px`);
      assert.ok(await page.locator('#detail-content .song-page[aria-hidden="false"]').evaluate(element => element.scrollWidth <= element.clientWidth), `song content must reflow at ${width}px`);

      await page.locator('#song-controls-toggle').click();
      assert.equal(await page.locator('#song-control-panel').isVisible(), true);
      assert.equal(await page.getByText('Acessibilidade de leitura', { exact: true }).count(), 0, 'reading accessibility disclosure is not rendered');
      await page.locator('#song-controls-toggle').click();

      if (width === 390) {
        const musicalText = page.locator('#detail-content .song-page[aria-hidden="false"] .letra-linha, #detail-content .song-page[aria-hidden="false"] .chord-line, #detail-content .song-page[aria-hidden="false"] .full-chord-line:not(.is-section)').first();
        const before = await musicalText.evaluate(element => parseFloat(getComputedStyle(element).fontSize));
        await page.evaluate(() => {
          const content = document.getElementById('detail-content');
          const fire = (type, id, x, y) => content.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, cancelable: true }));
          fire('pointerdown', 1, 90, 430);
          fire('pointerdown', 2, 210, 430);
          fire('pointermove', 2, 275, 430);
          fire('pointerup', 2, 275, 430);
          fire('pointerup', 1, 90, 430);
        });
        const after = await musicalText.evaluate(element => parseFloat(getComputedStyle(element).fontSize));
        assert.ok(after > before, 'pinch apart increases semantic text size in real time');
        assert.equal(await page.locator('[data-inline-editing="true"]').count(), 0, 'pinch does not open block editing');
        const chosenScale = await page.evaluate(() => songTextScale);
        await page.locator('#detail-content .song-page[aria-hidden="false"]').evaluate(element => { element.style.minHeight = '1200px'; document.getElementById('view-detail').scrollTop = 0; syncSongPageHeight(); });
        await page.locator('#btn-scroll').click();
        assert.equal(await controls.evaluate(element => element.classList.contains('is-scrolling')), true);
        assert.equal(await page.evaluate(() => songTextScale), chosenScale, 'auto-scroll preserves the chosen scale');
        assert.equal(await page.getByRole('button', { name: 'Pausar rolagem automática' }).isVisible(), true);
        await page.locator('#btn-scroll').click();
        await page.reload();
        await page.evaluate(() => openDetail(1));
        assert.equal(await page.evaluate(() => songTextScale), chosenScale, 'text scale persists for the user');
        await page.evaluate(() => { adjustSongTextScale(-10); });
        assert.equal(await page.evaluate(() => songTextScale), .8);
        await page.evaluate(() => { adjustSongTextScale(10); });
        assert.equal(await page.evaluate(() => songTextScale), 1.55);
      }
      assert.deepEqual(errors, []);
      await context.close();
    }
    console.log('song-controls-pinch-ui: OK (strip responsiva, pinch, limites, persistência, edição e auto-scroll)');
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; server.close(); });
