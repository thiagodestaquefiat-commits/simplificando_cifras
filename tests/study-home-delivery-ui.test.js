const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  try {
    const page = await browser.newPage();
    await page.route('**/*', route => route.fulfill({ contentType: 'text/html', body: '<button id="tab-musicas" aria-selected="true"></button><div id="playlist-ai-card" style="min-height:100px"><span id="playlist-ai-title"></span></div>' }));
    await page.goto('https://deploy-preview-999--simplificandocifras.netlify.app/?dedicationTest=1');
    await page.evaluate(() => {
      window.musicas = [{ id: 'a', title: 'Música A' }, { id: 'b', title: 'Música B' }];
      window.setlists = [{ id: 'e', repertoire: [{ id: 'i1', songId: 'a' }, { id: 'i2', songId: 'b' }] }];
      window.appCurrentUser = { id: 'test-owner' }; window.stageMode = false;
      window.appAuth = { subscribe(fn) { fn({ authenticated: true, user: appCurrentUser }); } };
      window.contextHistory = { presented() {} }; window.presentedContextFingerprints = new Set(); window.dispatchContextEvent = () => {};
      window.operational = false;
      window.resolveHomeCardContext = () => ({ contextAction: operational ? null : studyEvidence.candidates({ ...studyPreparation.input(), userId: appCurrentUser.id, now: Date.now(), events: setlists })[0] });
      window.renderContextualHomeCard = () => {
        if (!window.studyPreparation) return;
        const action = resolveHomeCardContext().contextAction;
        if (!action) return;
        if (!studyPreparation.canPresent(action)) return studyPreparation.requestPresentation(action);
        document.getElementById('playlist-ai-title').textContent = action.actionType;
        studyPreparation.presented(action, { title: action.actionType });
      };
    });
    for (const file of ['study-evidence', 'study-dedication-preview', 'study-preparation']) await page.addScriptTag({ path: path.resolve(`js/${file}.js`) });
    await page.waitForFunction(() => studyPreparation.tracker.snapshot()?.userId);
    for (const [kind, type] of [['song', 'RECOGNIZE_SONG_DEDICATION'], ['consistency', 'RECOGNIZE_CONSISTENCY'], ['repertoire', 'RECOGNIZE_REPERTOIRE_DEDICATION']]) {
      await page.evaluate(() => { operational = true; document.getElementById('playlist-ai-card').style.visibility = 'hidden'; });
      await page.evaluate(kind => studyDedicationPreview.simulate(kind), kind);
      assert.equal(await page.evaluate(() => studyPreparation.tracker.snapshot().sessions.some(s => s.consumedAt)), false, 'deferred evidence remains available');
      await page.evaluate(() => { operational = false; renderContextualHomeCard(); });
      await page.waitForTimeout(80);
      assert.equal(await page.evaluate(() => studyPreparation.tracker.snapshot().sessions.some(s => s.consumedAt)), false, 'hidden card cannot consume');
      await page.evaluate(() => { document.getElementById('playlist-ai-card').style.visibility = 'visible'; renderContextualHomeCard(); });

      await page.waitForFunction(() => studyPreparation.tracker.snapshot().sessions.every(s => s.consumedAt),null,{timeout:2000});
      assert.equal(await page.locator('#playlist-ai-title').textContent(), type);
    }
    await page.goto('https://simplificandocifras.netlify.app/?dedicationTest=1');
    await page.addScriptTag({ path: path.resolve('js/study-dedication-preview.js') });
    assert.equal(await page.evaluate(() => typeof studyDedicationPreview), 'undefined', 'production rejects test mode even with parameter');
    console.log('study-home-delivery-ui: OK (3 recognitions, deferred/hidden not consumed, visible consumed, production gate)');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
