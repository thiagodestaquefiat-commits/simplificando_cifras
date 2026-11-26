// Editar bloco no tom da tela (26/11): com capotraste guardado (formas em D) e o músico sem capo, a tela
// mostra E B. O editor tem que mostrar E B e, ao salvar, guardar de volta D A — sem trocar as notas.
const assert = require('node:assert/strict');
const fs = require('node:fs'), http = require('node:http'), path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  const file = path.resolve(root, pathname === '/' ? 'index.html' : pathname.slice(1));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return response.writeHead(404).end();
  response.setHeader('Content-Type', ({'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml'})[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(response);
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const executablePath = [process.env.BROWSER_EXECUTABLE, 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].find(value => value && fs.existsSync(value));
  const browser = await chromium.launch({ headless: true, executablePath });
  try {
    const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' })).newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort());
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.getByRole('button', { name: 'Continuar sem login' }).click({ timeout: 15000 });
    await page.waitForFunction(() => typeof beginInlineBlockEdit === 'function' && musicas.length > 0);
    const result = await page.evaluate(async () => {
      const song = songModel.normalizeCollection([{ id: 'capo-teste', title: 'Canção do Apocalipse', artist: 'Teste', key: 'D', capo: '2',
        blocos: [{ l: 'Meus olhos viram', c: 'D A (2x)' }, { l: '', c: 'Bm A D (3x)' }] }])[0];
      musicas = [song, ...musicas];
      openDetail('capo-teste'); await new Promise(r => setTimeout(r, 400));
      selectedCapo = 0; storedCapo = 2; currentSemitones = 0; setSongPage(1); renderDetail(); await new Promise(r => setTimeout(r, 300));
      const shown = [...document.querySelectorAll('#detail-content .song-page')[1].querySelectorAll('[data-long-press-edit]')][0];
      const shownText = shown.innerText;
      beginInlineBlockEdit(shown);
      const textarea = shown.querySelector('.inline-block-chords');
      const editorText = textarea.value;
      // Salva sem mudar nada: a música guardada não pode mudar.
      await saveInlineBlockEdit('capo-teste', 0, shown.querySelector('.inline-block-actions .primary') || shown.querySelector('button.primary'));
      const afterSave = songFormat.fromLegacy(musicas.find(m => m.id === 'capo-teste')).sections[0].lines.map(l => l.chords.map(c => c.name || c.chord || c).join(' ')).join(' | ');
      // Troca um acorde pelo que se vê na tela (E B -> E C#m): guarda D Bm.
      renderDetail(); await new Promise(r => setTimeout(r, 200));
      const again = [...document.querySelectorAll('#detail-content .song-page')[1].querySelectorAll('[data-long-press-edit]')][0];
      beginInlineBlockEdit(again);
      const area = again.querySelector('.inline-block-chords'); area.value = area.value.replace(/^E\s+B/m, 'E C#m');
      await saveInlineBlockEdit('capo-teste', 0, again.querySelector('button.primary'));
      const stored = songFormat.toLegacy(songFormat.fromLegacy(musicas.find(m => m.id === 'capo-teste')), musicas.find(m => m.id === 'capo-teste')).blocos?.[0]?.c || JSON.stringify(songFormat.fromLegacy(musicas.find(m => m.id === 'capo-teste')).sections[0]);
      return { shownText, editorText, afterSave, stored };
    });
    assert.match(result.shownText, /E\s+B/, 'a tela mostra E B (formas sem capo)');
    assert.match(result.editorText, /^E\s+B/m, 'o editor mostra o mesmo que a tela: ' + JSON.stringify(result.editorText));
    assert.doesNotMatch(result.editorText, /^D\s+A/m, 'o editor não mostra o tom guardado');
    assert.match(result.stored, /D\s+Bm/, 'trocar B por C#m na tela guarda Bm no tom guardado: ' + result.stored);
    assert.deepEqual(errors, []);
    console.log('inline-edit-display-key-ui.test.js: OK — editar não troca as notas');
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
