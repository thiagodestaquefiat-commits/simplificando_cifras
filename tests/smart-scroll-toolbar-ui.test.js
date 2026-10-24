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
  response.setHeader('Content-Type', ({ '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' })[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(response);
});

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const executablePath = [process.env.BROWSER_EXECUTABLE, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(file => file && fs.existsSync(file));
  const browser = await chromium.launch({ headless: true, executablePath });
  try {
    for (const width of [320, 390, 768, 1366]) {
      const context = await browser.newContext({ viewport: { width, height: 844 }, serviceWorkers: 'block' });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/api/**', route => route.fulfill({ json: { enabled: false, songs: [], events: [], bands: [] } }));
      await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ body: '', contentType: 'text/css' }));
      await page.goto(`http://127.0.0.1:${server.address().port}/?smart-toolbar-test=1`);
      await page.waitForFunction(() => loginGateAuthReady);
      await page.evaluate(() => {
        continueWithoutLogin();
        musicas.push(songModel.create({ id: 'toolbar-fixture', title: 'Teste da barra', key: 'A', blocos: Array.from({ length: 30 }, () => ({ l: 'Verso', c: 'A D E A' })) }));
        openDetail('toolbar-fixture');
      });
      const strip = page.locator('.song-control-strip');
      assert.equal(await strip.locator('#btn-scroll + #btn-smart-scroll').count(), 1);
      assert.equal(await page.locator('#smart-scroll-row').count(), 0);
      const automatic = await page.locator('#btn-scroll').boundingBox();
      const intelligent = await page.locator('#btn-smart-scroll').boundingBox();
      assert.equal(automatic.y, intelligent.y, `same row at ${width}px`);
      assert.ok(automatic.x + automatic.width <= intelligent.x + .5, `adjacent without overlap at ${width}px`);
      assert.ok(intelligent.width >= 40, `usable button width at ${width}px`);
      assert.ok(await strip.evaluate(node => node.scrollWidth <= node.clientWidth), `toolbar fits at ${width}px`);
      assert.equal(await page.locator('#btn-smart-scroll').getAttribute('aria-pressed'), 'false');
      const icon = page.locator('#btn-smart-scroll svg');
      await page.evaluate(() => updateSmartScrollUI({ active: true }));
      assert.equal(await page.locator('#btn-smart-scroll').getAttribute('aria-pressed'), 'true');
      assert.equal(await icon.count(), 1, 'state changes must preserve the toolbar icon');
      await page.evaluate(() => updateSmartScrollUI());
      await page.locator('#btn-scroll').click();
      assert.equal(await page.locator('#btn-smart-scroll').isVisible(), true, 'intelligent control remains alongside scrolling controls');
      assert.ok(await strip.evaluate(node => node.scrollWidth <= node.clientWidth), `active toolbar fits at ${width}px`);
      await page.locator('#btn-scroll').click();
      assert.deepEqual(errors, []);
      await context.close();
    }
    console.log('smart-scroll-toolbar-ui: OK (adjacency, responsive widths, active state and preserved controls)');
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; server.close(); });
