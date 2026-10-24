const assert = require('node:assert/strict');
const { chromium } = require(process.env.ROUDY_TEST_PLAYWRIGHT || 'playwright');

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.ROUDY_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' }), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/**', route => route.fulfill({ json: { enabled: false, songs: [], events: [], bands: [] } }));
    await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ body: '', contentType: 'text/css' }));
    await page.goto('http://127.0.0.1:4183/?contextual-roadie-ui=590');
    await page.waitForFunction(() => loginGateAuthReady);
    await page.evaluate(() => {
      continueWithoutLogin();
      const day = new Date(); day.setDate(day.getDate() + 3); const date = day.toISOString().slice(0, 10);
      musicas = [{ id: 'roadie-song', title: 'Canção Roadie', artist: 'Equipe', key: 'G', blocos: [{ l: 'Linha', c: 'G C' }] }];
      setlists = [eventModel.create({ id: 'roadie-event', title: 'Ensaio Roadie', date, time: '19:00', members: [], repertoire: [{ id: 'roadie-item', songId: 'roadie-song', shared: { title: 'Canção Roadie', key: 'G' }, preparation: { state: 'UNKNOWN', relevantChanges: [], evidenceIncomplete: true } }], notifications: [{ id: 'roadie-change', actorName: 'Líder', changeType: 'KEY_CHANGED', kind: 'repertoire.key.updated', songId: 'roadie-song', before: 'G', after: 'A', summary: 'alterou o tom para A', createdAt: new Date().toISOString() }] })];
      switchTab('musicas'); renderContextualHomeCard();
    });
    assert.equal((await page.locator('#playlist-context-kicker').innerText()).trim(), 'MUDANÇAS NO EVENTO');
    assert.match(await page.locator('#playlist-ai-title').innerText(), /tom|repertório/i);
    const action = page.locator('#playlist-context-actions .playlist-ai-action--primary');
    assert.equal((await action.innerText()).trim(), 'Conferir alteração');
    await action.click();
    await page.locator('.notification-center-page').waitFor({ state: 'visible' });
    assert.deepEqual(errors, []);
    console.log('contextual-roadie-ui.test.js: OK');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
