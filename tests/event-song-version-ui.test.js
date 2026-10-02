// Versão da música no evento: anotações na tela da música/palco, "Salvar neste evento" (tom/capo) e música repetida.
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
  response.setHeader('Content-Type', ({'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.webmanifest':'application/manifest+json'})[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(response);
});

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const executablePath = [process.env.BROWSER_EXECUTABLE, 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].find(value => value && fs.existsSync(value));
  const browser = await chromium.launch({ headless: true, executablePath });
  try {
    const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' })).newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => dialog.accept());
    await page.addInitScript(() => { const auth = { initialize: async () => ({ authenticated: true }), subscribe: () => () => {}, getState: () => ({ authenticated: true }), getAccessToken: () => 'test-token' }; Object.defineProperty(window, 'appAuth', { get: () => auth, set: () => {} }); });
    await page.route(/\/api\/library/, route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
    await page.route('**/api/collaboration/**', route => route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ erro: { codigo: 'nao_publicado', mensagem: 'Backend de teste' } }) }));
    await page.route('**/api/auth/config', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ enabled: false, provider: 'local' }) }));
    await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.evaluate(() => {
      appCurrentUser = Object.freeze({ ...appCurrentUser, id: 'leader-test', name: 'Líder' });
      musicas.push(songModel.create({ id: 'ver-song', title: 'Canção Versão', key: 'C', blocos: [{ l: '', c: 'C F G' }] }));
      eventCollaboration.ensureLocalIdentity(appCurrentUser);
      // A mesma música duas vezes no evento, com tom/capo diferentes.
      setlists.push(eventModel.create({ id: 'ev-ver', title: 'Culto', leaderId: appCurrentUser.id, members: [{ ...appCurrentUser, isLeader: true }],
        repertoire: [
          { id: 'item-a', songId: 'ver-song', shared: { key: 'C', notes: 'Entrada só voz' } },
          { id: 'item-b', songId: 'ver-song', shared: { key: 'D', capo: '2', notes: '' } }
        ] }));
      openDetailFromEventItem('ev-ver', 'item-a');
    });

    // 1) Anotação do evento aparece na tela da música.
    assert.match(await page.locator('#event-detail-notes').innerText(), /Entrada só voz/);
    assert.equal(await page.locator('#event-save-version').count(), 0, 'sem mudança, sem botão');

    // 2) Mudou o capo -> botão aparece; salva como pessoal.
    await page.evaluate(() => selectCapo(3));
    assert.match(await page.locator('#event-save-version').innerText(), /capo 3/);
    await page.locator('#event-save-version').click();
    await page.locator('#event-version-confirm').click();
    await page.waitForFunction(() => findEvent('ev-ver').repertoire[0].personalEdits['leader-test']?.capo === '3');
    assert.equal(await page.evaluate(() => findEvent('ev-ver').repertoire[0].shared.capo || ''), '', 'oficial não muda');
    assert.equal(await page.locator('#event-save-version').count(), 0, 'depois de salvar, botão some');
    assert.equal(await page.evaluate(() => musicas.find(song => song.id === 'ver-song').capo || 0), 0, 'biblioteca não muda');

    // 3) Subiu 2 semitons -> salva como compartilhada (líder); anotação oficial preservada.
    await page.evaluate(() => transpose(2));
    await page.locator('#event-save-version').click();
    await page.locator('input[name="event-version-scope"][value="shared"]').check();
    await page.locator('#event-version-confirm').click();
    await page.waitForFunction(() => findEvent('ev-ver').repertoire[0].shared.key === 'D');
    assert.equal(await page.evaluate(() => findEvent('ev-ver').repertoire[0].shared.notes), 'Entrada só voz');

    // 4) Música repetida: a 2ª entrada usa o tom/capo dela, não os da 1ª.
    const second = await page.evaluate(() => { closeDetail(); openStageFromEvent('ev-ver'); return { key: currentStageSongAt(1).key, capo: String(currentStageSongAt(1).capo || '') }; });
    assert.equal(second.key, 'D');
    assert.match(second.capo, /2/);
    assert.deepEqual(errors, []);
    console.log('event-song-version-ui.test.js: OK (anotações visíveis, salvar pessoal/compartilhada, biblioteca intacta, música repetida)');
  } finally {
    await browser.close(); server.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
