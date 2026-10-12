const assert = require('node:assert/strict');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  try {
    for (const width of [320, 390, 768, 1366]) {
      const context = await browser.newContext({ viewport: { width, height: 844 }, serviceWorkers: 'block' });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/api/**', route => route.fulfill({ json: { enabled: false, songs: [], events: [], bands: [] } }));
      await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ body: '', contentType: 'text/css' }));
      await page.goto('http://127.0.0.1:4173/?smart-toolbar-test=1');
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
      if (width === 390 || width === 1366) {
        await page.locator('#song-controls').screenshot({ path: `C:/Users/ACER/AppData/Local/Temp/roudy-smart-toolbar-${width}.png` });
      }
      assert.deepEqual(errors, []);
      await context.close();
    }
    console.log('smart-scroll-toolbar-ui: OK (adjacency, responsive widths, active state and preserved controls)');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
