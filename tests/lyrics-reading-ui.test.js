const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  const file = path.resolve(root, pathname === '/' ? 'index.html' : decodeURIComponent(pathname.slice(1)));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return response.writeHead(404).end();
  response.setHeader('Content-Type', ({ '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' })[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(response);
});

const SHEET = `[INTRO]
C G Am F
Uma linha curta

[PRIMEIRA PARTE]
C                       G
Esta é uma frase longa que precisa quebrar automaticamente sem virar dois versos ou ganhar um espaço artificial no meio
Am F
Outro verso independente

[REFRÃO]
F G C
Eu canto outra vez`;

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const executablePath = [process.env.BROWSER_EXECUTABLE, 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].find(file => file && fs.existsSync(file));
  const browser = await chromium.launch({ headless: true, executablePath });
  try {
    for (const width of [375, 390, 430]) {
      const context = await browser.newContext({ viewport: { width, height: 844 }, serviceWorkers: 'block' });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/api/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
      await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
      await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => typeof continueWithoutLogin === 'function' && typeof renderFullChordSheet === 'function');
      await page.evaluate(sheet => {
        continueWithoutLogin();
        musicas.push(songModel.create({ id: 'lyrics-reading', title: 'Leitura musical', artist: 'ROUDY', key: 'C', blocos: [{ l: 'Uma linha curta', c: 'C G' }], fullChordSheet: { visibility: 'private', source: 'user_text', content: sheet, sections: [] } }));
        openDetail('lyrics-reading');
        setSongPage(2, { animate: false });
      }, SHEET);

      const lyricsPage = page.locator('.song-page-lyrics');
      const verses = lyricsPage.locator('.song-lyrics-verse');
      const longVerse = verses.filter({ hasText: 'Esta é uma frase longa' });
      const metrics = await lyricsPage.evaluate(element => {
        const verse = element.querySelector('.song-lyrics-verse');
        const title = element.querySelector('.song-lyrics-section-title');
        const style = getComputedStyle(verse);
        const pageStyle = getComputedStyle(element);
        return {
          fontSize: style.fontSize,
          fontWeight: style.fontWeight,
          lineHeight: style.lineHeight,
          letterSpacing: style.letterSpacing,
          paddingLeft: pageStyle.paddingLeft,
          paddingRight: pageStyle.paddingRight,
          titleSize: getComputedStyle(title).fontSize,
          titleWeight: getComputedStyle(title).fontWeight,
          titleColor: getComputedStyle(title).color,
          titleFamily: getComputedStyle(title).fontFamily,
          titleLineHeight: getComputedStyle(title).lineHeight,
          titleSpacing: getComputedStyle(title).letterSpacing,
          titleTransform: getComputedStyle(title).textTransform,
          titleMarginBottom: getComputedStyle(title).marginBottom,
          sectionBackground: getComputedStyle(element.querySelector('.full-chord-section')).backgroundColor,
          sheetBackground: getComputedStyle(element.querySelector('.full-chord-sheet-sections')).backgroundColor,
          fits: element.scrollWidth <= element.clientWidth
        };
      });
      assert.equal(metrics.fontSize, '25px', `base tipográfica em ${width}px`);
      assert.ok(Number(metrics.fontWeight) >= 700, `peso da letra em ${width}px`);
      assert.equal(metrics.lineHeight, '32px', `line-height 1.28 em ${width}px`);
      assert.equal(metrics.letterSpacing, '-0.5px', `tracking -0.02em em ${width}px`);
      assert.equal(metrics.titleSize, '13px');
      assert.ok(Number(metrics.titleWeight) >= 600);
      assert.equal(metrics.titleColor, 'rgb(161, 161, 170)');
      assert.match(metrics.titleFamily, /Inter|Segoe UI/);
      assert.ok(Math.abs(parseFloat(metrics.titleLineHeight) - 18.2) < .2);
      assert.equal(metrics.titleSpacing, '0.52px');
      assert.equal(metrics.titleTransform, 'uppercase');
      assert.equal(metrics.titleMarginBottom, '20px');
      assert.equal(metrics.sectionBackground, 'rgba(0, 0, 0, 0)', 'o bloco editável não adiciona fundo azul');
      assert.equal(metrics.sheetBackground, 'rgba(0, 0, 0, 0)', 'o contêiner das seções também permanece transparente');
      assert.ok(parseFloat(metrics.paddingLeft) >= 20 && parseFloat(metrics.paddingRight) >= 20);
      assert.equal(metrics.fits, true, `sem overflow horizontal em ${width}px`);
      assert.equal(await longVerse.count(), 1, 'quebra automática não cria outro verso');
      assert.ok(await longVerse.evaluate(element => element.getBoundingClientRect().height > 32), 'frase longa quebra dentro do mesmo verso');
      assert.equal(await lyricsPage.locator('.song-lyrics-stanza').count(), 3, 'linhas vazias entre seções permanecem representadas pelo espaçamento semântico das estrofes');
      assert.equal(await lyricsPage.locator('.full-chord-section[data-long-press-edit]').count(), 3, 'cada seção musical possui seu próprio alvo de long press');

      const emptySections = await page.evaluate(() => {
        const box = document.createElement('div');
        box.innerHTML = renderFullChordSheet({ content: '[Verso]\nC\nLinha real', sections: [
          { nome: 'Solo 1', linhas: [{ letra: '', acordes: [{ acorde: 'C', posicao: 0 }] }] },
          { nome: 'Pré-refrão', linhas: [] },
          { nome: 'Refrão 1', linhas: [{ letra: 'Linha real', acordes: [{ acorde: 'C', posicao: 0 }] }] }
        ] }, 0, 'lyrics-reading', 'lyrics');
        return { text: box.textContent, stanzas: box.querySelectorAll('.song-lyrics-stanza').length };
      });
      assert.doesNotMatch(emptySections.text, /Solo 1|Pré-refrão/, 'seções sem letra não aparecem');
      assert.match(emptySections.text, /Refrão 1/);
      assert.equal(emptySections.stanzas, 1, 'somente a seção com versos permanece');

      const verseGap = await verses.nth(2).evaluate((element, previous) => element.getBoundingClientRect().top - previous.getBoundingClientRect().bottom, await verses.nth(1).elementHandle());
      assert.ok(verseGap >= 23 && verseGap <= 25, `versos independentes mantêm 24px em ${width}px`);

      await page.evaluate(() => applySongTextScale(1.2, { persist: false, announce: false }));
      assert.equal(await verses.first().evaluate(element => getComputedStyle(element).fontSize), '30px', 'preferência de tamanho continua aplicada');
      assert.equal(await lyricsPage.evaluate(element => element.scrollWidth <= element.clientWidth), true, 'fonte ampliada continua responsiva');

      await page.evaluate(() => setSongPage(1, { animate: false }));
      const combined = page.locator('.song-page-combined .full-chord-line:not(.is-chord):not(.is-section)').first();
      assert.equal(await combined.evaluate(element => getComputedStyle(element).fontFamily.includes('JetBrains Mono')), true, 'letra+cifra preserva fonte monoespaçada');
      assert.equal(await combined.evaluate(element => element.classList.contains('song-lyrics-verse')), false, 'marcação nova não invade a página combinada');
      const combinedTitle = page.locator('.song-page-combined .song-section-heading').first();
      assert.equal(await combinedTitle.evaluate(element => getComputedStyle(element).fontSize), '15.6px', 'título acompanha a preferência de escala');
      assert.equal(await combinedTitle.evaluate(element => getComputedStyle(element).color), 'rgb(161, 161, 170)');
      assert.equal(await combinedTitle.evaluate(element => getComputedStyle(element).fontFamily.includes('JetBrains Mono')), false, 'título da cifra nunca usa monoespaçada');

      const sectionRecognition = await page.evaluate(() => {
        const box = document.createElement('div');
        box.innerHTML = renderMusicalText('Intro\nvolto na ponte para casa\nRefrão 2\nSolo1', 0, false);
        const rows = [...box.children].map(element => ({ text: element.textContent, heading: element.classList.contains('song-section-heading') }));
        const custom = document.createElement('div');
        custom.innerHTML = renderFullChordSheet({ content: 'x', sections: [{ nome: 'Momento espontâneo', linhas: [{ letra: 'Uma letra', acordes: [] }] }] }, 0, 'custom', 'combined');
        return { rows, custom: custom.querySelector('.song-section-heading')?.textContent };
      });
      assert.deepEqual(sectionRecognition.rows.map(row => row.heading), [true, false, true, true], 'somente linhas inteiras de seção recebem o componente');
      assert.equal(sectionRecognition.custom, 'Momento espontâneo', 'título personalizado estruturado é preservado');

      const stageTitle = await page.evaluate(() => {
        const view = document.getElementById('view-detail');
        view.classList.add('stage-mode');
        const title = document.querySelector('.song-page-combined .song-section-heading');
        const style = getComputedStyle(title);
        const result = { size: style.fontSize, weight: style.fontWeight, color: style.color, family: style.fontFamily, transform: style.textTransform };
        view.classList.remove('stage-mode');
        return result;
      });
      assert.equal(stageTitle.size, '15.6px');
      assert.equal(stageTitle.weight, '600');
      assert.equal(stageTitle.color, 'rgb(161, 161, 170)');
      assert.equal(stageTitle.transform, 'uppercase');
      assert.equal(stageTitle.family.includes('JetBrains Mono'), false);
      if (width === 390) {
        await page.evaluate(() => setSongPage(2, { animate: false }));
        const chorus = page.locator('.song-page-lyrics .full-chord-section[data-edit-full-section="2"]');
        await chorus.evaluate(element => beginInlineBlockEdit(element));
        assert.equal(await chorus.locator('.inline-block-chords').count(), 0, 'Só letras não expõe o campo de cifras');
        assert.equal(await chorus.locator('.inline-block-lyrics').inputValue(), 'Eu canto outra vez', 'letra permanece em um campo próprio');
        await chorus.locator('.inline-block-lyrics').fill('Texto atualizado');
        await chorus.locator('button.primary').click();
        await page.waitForFunction(() => musicas.find(song => song.id === 'lyrics-reading')?.fullChordSheet?.content.includes('Texto atualizado'));
        const saved = await page.evaluate(() => musicas.find(song => song.id === 'lyrics-reading').fullChordSheet.content);
        assert.match(saved, /Uma linha curta/, 'editar o refrão preserva a introdução');
        assert.match(saved, /Esta é uma frase longa/, 'editar o refrão preserva a primeira parte');
        assert.match(saved, /\[REFRÃO\]/, 'o título original da seção é preservado');
        assert.match(saved, /F G C/, 'as cifras ocultas permanecem preservadas ao editar somente a letra');
        assert.match(saved, /Texto atualizado/, 'somente a seção escolhida é atualizada');
        await page.evaluate(() => setSongPage(1, { animate: false }));
        const combinedChorus = page.locator('.song-page-combined .full-chord-section[data-edit-full-section="2"]');
        await combinedChorus.evaluate(element => beginInlineBlockEdit(element));
        assert.equal(await combinedChorus.locator('.inline-block-chords').count(), 0, 'Letra + cifras não separa a cifra em outro campo');
        assert.equal(await combinedChorus.locator('.inline-block-lyrics').count(), 0, 'Letra + cifras não separa a letra em outro campo');
        assert.equal(await combinedChorus.locator('.inline-block-section-full').inputValue(), '[REFRÃO]\nF G C\nTexto atualizado', 'a seção combinada mantém título, cifras e letra no mesmo editor');
        assert.equal(await combinedChorus.getByRole('button', { name: 'Excluir' }).count(), 1, 'a seção oferece exclusão isolada');
        await combinedChorus.getByRole('button', { name: 'Excluir' }).click();
        assert.equal(await page.getByRole('heading', { name: 'Excluir este bloco?' }).count(), 1, 'a exclusão exige confirmação explícita');
        assert.match(await page.locator('#inline-delete-description').textContent(), /cifras e a letra deste bloco serão removidas/i);
        await page.locator('#inline-delete-confirm-layer').getByRole('button', { name: 'Cancelar' }).click();
        assert.equal(await page.locator('#inline-delete-confirm-layer').count(), 0, 'cancelar mantém o bloco e fecha a confirmação');
        assert.equal(await combinedChorus.getByRole('button', { name: 'Editar música inteira' }).count(), 0, 'o editor inline permanece restrito à seção selecionada');
        await page.evaluate(() => cancelInlineBlockEdit());
      }
      assert.deepEqual(errors, []);
      await context.close();
    }
    console.log('lyrics-reading-ui.test.js: OK (375/390/430, semântica, escala e página combinada preservada)');
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; server.close(); });
