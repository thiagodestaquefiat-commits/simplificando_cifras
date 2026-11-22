// SUÍTE DO CULTO (22/11) — o caminho que a banda usa no domingo, num celular Android simulado.
// Roda com: node scripts/test-ui.js culto   (não gasta crédito da Netlify)
// Cobre: rolagem automática (com o arredondamento de pixel do Android), velocidade lembrada, botão e Modo Palco,
// troca de página no palco, página Letra limpa, adicionar/remover do repertório com confirmação,
// memória cheia, playlist em ordem alfabética e ausência do leitor de QR.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  const file = path.resolve(root, pathname === '/' ? 'index.html' : pathname.slice(1));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return response.writeHead(404).end();
  response.setHeader('Content-Type', ({'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'})[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(response);
});

const DPR = 2.625; // Pixel / Galaxy: a rolagem só para em múltiplos de 1/2,625 px
const SONG = "[Intro]\nC#F#G#\n\n[Refrão]\nE           B9\nEu encontrei o meu tesouro\nC#m         A\nEu encontrei o bem mais precioso\n        B9.                    E/G#\nQue nunca,       nunca será tirada\n" + Array.from({length:40},(_,i)=>`A          E\nLinha de teste número ${i+1} da música`).join('\n');

async function openApp(browser) {
  const context = await browser.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:DPR, isMobile:true, hasTouch:true, serviceWorkers:'block' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort());
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.getByRole('button', { name: 'Continuar sem login' }).click({ timeout: 15000 });
  await page.waitForFunction(() => typeof openDetailFromEventItem === 'function' && Array.isArray(musicas) && musicas.length > 0);
  // Evento de teste com 3 músicas, a primeira com cifra longa e linhas "problemáticas".
  await page.evaluate(SONG => {
    const base = musicas.filter(song => song.fullChordSheet?.content).slice(0, 3);
    const first = { ...structuredClone(base[0]), id: 'culto-teste', title: 'Boa Parte', fullChordSheet: { ...base[0].fullChordSheet, sections: undefined, content: SONG } };
    musicas = [first, ...musicas.filter(song => song.id !== first.id)];
    const songs = [first, base[1], base[2]];
    setlists = [eventModel.create({ id:'culto', title:'Culto de domingo', leaderId:appCurrentUser.id, members:[{...appCurrentUser,isLeader:true}],
      repertoire: songs.map((song, i) => ({ id:'r'+i, songId:song.id, shared:eventEditFromSong(eventSongCopy(song)) })) })];
    eventRepository.save(setlists);
  }, SONG);
  return { context, page, errors };
}

// Simula o Android: a rolagem fica no pixel físico (pedir 100 vira 99,81).
async function androidRounding(page) {
  await page.evaluate(DPR => {
    const vd = document.getElementById('view-detail'), desc = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop');
    let own = desc.get.call(vd);
    Object.defineProperty(vd, 'scrollTop', { configurable: true,
      get() { const native = desc.get.call(vd); if (Math.abs(native - own) > 1.5) own = native; return own; },
      set(value) { own = Math.floor(value * DPR) / DPR; desc.set.call(vd, Math.round(own)); } });
  }, DPR);
}
const scrollTop = page => page.evaluate(() => document.getElementById('view-detail').scrollTop);

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const executablePath = [process.env.BROWSER_EXECUTABLE, 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].find(value => value && fs.existsSync(value));
  const browser = await chromium.launch({ headless: true, executablePath });
  try {
    const { context, page, errors } = await openApp(browser);

    // 1. Estudo: botão Palco aparece na música do evento.
    await page.evaluate(() => openDetailFromEventItem('culto', 'r0'));
    await page.waitForTimeout(500);
    await page.evaluate(() => setSongPage(0));
    assert.equal(await page.locator('#btn-palco').isVisible(), true, 'botão Palco aparece na música do evento');

    // 2. Rolagem automática anda com o arredondamento do Android e não engasga.
    await androidRounding(page);
    await page.evaluate(() => { scrollSpeed = 30; });
    const before = await scrollTop(page);
    await page.locator('#btn-scroll').click();
    await page.waitForTimeout(2500);
    const after = await scrollTop(page);
    assert.ok(after - before > 40, `rolagem automática anda no Android (andou ${Math.round(after - before)}px)`);
    assert.equal(await page.evaluate(() => scrollTimer !== null), true, 'rolagem continua ligada (não para no arredondamento)');
    const steps = await page.evaluate(async () => { const vd = document.getElementById('view-detail'), c = document.getElementById('detail-content'), out = [];
      const pos = () => vd.scrollTop - Number((/translate3d\(0px?, ?(-?[\d.]+)px/.exec(c.style.transform) || [0, 0])[1]);
      for (let i = 0; i < 40; i++) { out.push(pos()); await new Promise(r => requestAnimationFrame(r)); } return out.slice(1).map((v, i) => v - out[i]); });
    const stalled = steps.filter(step => step < 0.05).length;
    assert.ok(stalled <= 4, `movimento contínuo, sem "anda e para" (${stalled} quadros parados de ${steps.length})`);
    await page.locator('#btn-scroll').click();
    assert.equal(await page.evaluate(() => document.getElementById('detail-content').style.transform), '', 'ao parar, o deslocamento é limpo');

    // 3. Velocidade lembrada ao sair e voltar para a música do evento.
    await page.evaluate(() => setSongScrollSpeed(45));
    const chosen = await page.evaluate(() => scrollSpeed);
    await page.evaluate(() => { openDetailFromEventItem('culto', 'r1'); });
    await page.waitForTimeout(300);
    await page.evaluate(() => { openDetailFromEventItem('culto', 'r0'); });
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => scrollSpeed), chosen, 'a velocidade escolhida não volta para 0,50');

    // 4. Página Letra limpa: sem as linhas de acorde "C#F#G#" e "B9.  E/G#", sem espaços sobrando.
    await page.evaluate(() => setSongPage(2));
    await page.waitForTimeout(300);
    const lyrics = await page.evaluate(() => document.querySelectorAll('#detail-content .song-page')[2].innerText);
    assert.doesNotMatch(lyrics, /C#F#G#|B9\.|E\/G#/, 'acordes não aparecem na página Letra');
    assert.match(lyrics, /Que nunca, nunca será tirada/, 'espaços de alinhamento somem na Letra');

    // 5. Modo Palco abre na página do estudo, troca de página passando o dedo, sem pontinhos, e rola.
    await page.evaluate(() => setSongPage(0));
    await page.locator('#btn-palco').click();
    await page.waitForTimeout(600);
    assert.equal(await page.evaluate(() => stageMode && currentSongPage), 0, 'palco abre na mesma página do estudo');
    assert.equal(await page.locator('#song-page-indicator').isVisible(), false, 'sem pontinhos de página no palco');
    const box = await page.locator('#detail-content').boundingBox(), cdp = await context.newCDPSession(page), y = box.y + 260;
    await cdp.send('Input.dispatchTouchEvent', { type:'touchStart', touchPoints:[{x:330,y}] });
    for (let i = 1; i <= 8; i++) { await cdp.send('Input.dispatchTouchEvent', { type:'touchMove', touchPoints:[{x:330 - 36*i, y}] }); await page.waitForTimeout(16); }
    await cdp.send('Input.dispatchTouchEvent', { type:'touchEnd', touchPoints:[] });
    await page.waitForTimeout(500);
    if (await page.evaluate(() => currentSongPage) !== 1) { // o primeiro gesto às vezes chega antes da página assentar
      await cdp.send('Input.dispatchTouchEvent', { type:'touchStart', touchPoints:[{x:330,y}] });
      for (let i = 1; i <= 8; i++) { await cdp.send('Input.dispatchTouchEvent', { type:'touchMove', touchPoints:[{x:330 - 36*i, y}] }); await page.waitForTimeout(16); }
      await cdp.send('Input.dispatchTouchEvent', { type:'touchEnd', touchPoints:[] });
      await page.waitForTimeout(500);
    }
    assert.equal(await page.evaluate(() => currentSongPage), 1, 'passar o dedo troca a página no palco');
    await page.evaluate(() => setSongPage(0));
    await page.waitForTimeout(200);
    await androidRounding(page);
    await page.evaluate(() => { scrollSpeed = 30; });
    const stageBefore = await scrollTop(page);
    await page.evaluate(() => [...document.querySelectorAll('[onclick*="toggleAutoScroll"]')].find(el => el.offsetParent)?.click());
    await page.waitForTimeout(2000);
    const stageDebug = await page.evaluate(() => ({ running: scrollTimer !== null, top: document.getElementById('view-detail').scrollTop, h: document.getElementById('view-detail').scrollHeight, c: document.getElementById('view-detail').clientHeight, toggles: [...document.querySelectorAll('[onclick*="toggleAutoScroll"]')].map(el => el.id + ':' + Boolean(el.offsetParent)).join(',') }));
    assert.ok(await scrollTop(page) - stageBefore > 30, 'rolagem automática anda no palco ' + JSON.stringify({ stageBefore, ...stageDebug }));
    await page.evaluate(() => pauseAutoScroll());
    const lineWidth = await page.evaluate(() => { const line = [...document.querySelectorAll('#detail-content .song-page')[0].querySelectorAll('*')].find(el => /tesouro/.test(el.textContent) && !el.children.length); return line ? line.closest('.song-page').getBoundingClientRect().width : 0; });
    assert.ok(lineWidth > 330, `cifra do palco usa a largura da tela (${Math.round(lineWidth)}px)`);
    await page.evaluate(() => exitStageMode());

    // 6. Repertório: tocar de novo no ✓ pergunta antes de tirar da banda toda.
    const songId = await page.evaluate(() => musicas[5].id);
    await page.evaluate(id => addSongToEvent('culto', id), songId);
    const count = () => page.evaluate(() => findEvent('culto').repertoire.length);
    assert.equal(await count(), 4, 'música entra no repertório');
    page.once('dialog', dialog => dialog.dismiss());
    await page.evaluate(id => addSongToEvent('culto', id), songId);
    assert.equal(await count(), 4, 'cancelar a confirmação mantém a música');
    page.once('dialog', dialog => dialog.accept());
    await page.evaluate(id => addSongToEvent('culto', id), songId);
    assert.equal(await count(), 3, 'confirmando, a música sai');

    // 7. Memória cheia: o app apaga só backups antigos e adiciona a música ao repertório.
    const filled = await page.evaluate(() => {
      const old = JSON.stringify(Array.from({ length: 200 }, (_, i) => ({ i, song: 'x'.repeat(1800) })));
      let n = 0; try { for (; n < 60; n++) localStorage.setItem(`sc_sync_conflict_backups_v1:teste-${n}`, old); } catch (_) {}
      try { for (let k = 0; k < 400; k++) localStorage.setItem('sc_enchendo_' + k, 'y'.repeat(200000)); } catch (_) {}
      return n;
    });
    assert.ok(filled > 0, 'a memória foi enchida com backups antigos');
    const filler = await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('sc_enchendo_')).length);
    await page.evaluate(id => addSongToEvent('culto', id), songId);
    assert.equal(await count(), 4, 'com a memória cheia, a música entra no repertório');
    assert.equal(await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('sc_enchendo_')).length), filler, 'nada além de backups foi apagado');
    await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('sc_enchendo_') || k.startsWith('sc_sync_conflict_backups_v1:teste-')).forEach(k => localStorage.removeItem(k)));

    // 8. Playlist em ordem alfabética.
    await page.evaluate(() => { closeDetail(); switchTab('musicas'); });
    await page.waitForTimeout(300);
    const order = await page.evaluate(async () => {
      const own = appCurrentUser.id, picks = musicas.filter(song => song.title).slice(2, 8);
      const playlist = userPlaylists.create(own, 'Ordem');
      [...picks].reverse().forEach(song => userPlaylists.addSong(own, playlist.id, song.id));
      homePlaylists.open(playlist.id); await new Promise(r => setTimeout(r, 400));
      return [...document.querySelectorAll('#home-playlist-view .home-playlist-song-open strong')].map(el => el.textContent.trim());
    });
    const collator = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true });
    assert.ok(order.length >= 2, 'playlist mostra as músicas');
    assert.deepEqual(order, [...order].sort(collator.compare), 'músicas da playlist em ordem alfabética');
    // Deslizar a música para o lado pergunta antes de tirar da playlist (22/11).
    const rowCount = () => page.locator('#home-playlist-view .home-playlist-song-swipe').count();
    const rowsBefore = await rowCount();
    const swipeFirst = async () => {
      const row = page.locator('#home-playlist-view .home-playlist-song').first(); await row.scrollIntoViewIfNeeded(); await page.waitForTimeout(200);
      const rb = await row.boundingBox(), ry = rb.y + rb.height / 2;
      await cdp.send('Input.dispatchTouchEvent', { type:'touchStart', touchPoints:[{x:rb.x + rb.width * 0.55, y:ry}] });
      for (let i = 1; i <= 12; i++) { await cdp.send('Input.dispatchTouchEvent', { type:'touchMove', touchPoints:[{x:rb.x + rb.width * 0.55 - 22*i, y:ry}] }); await page.waitForTimeout(16); }
      await cdp.send('Input.dispatchTouchEvent', { type:'touchEnd', touchPoints:[] });
      await page.waitForTimeout(500);
    };
    let asked = 0;
    page.once('dialog', dialog => { asked += 1; dialog.dismiss(); });
    await swipeFirst();
    assert.equal(asked, 1, 'deslizar pergunta antes de tirar da playlist');
    assert.equal(await rowCount(), rowsBefore, 'cancelando, a música fica na playlist');
    page.once('dialog', dialog => { asked += 1; dialog.accept(); });
    await swipeFirst();
    assert.equal(asked, 2);
    assert.equal(await rowCount(), rowsBefore - 1, 'confirmando, a música sai da playlist');

    // 9. Leitor de QR fora do app.
    assert.equal(await page.evaluate(() => typeof window.eventQrScanner + typeof window.profileQr), 'undefinedundefined', 'leitor de QR não carrega');
    assert.equal(await page.locator('text=Escanear QR').count(), 0, 'sem botão "Escanear QR"');

    assert.deepEqual(errors, [], 'nenhum erro de página durante o caminho do culto');
    await context.close();
    console.log('culto-path-ui.test.js: OK — caminho do culto funcionando no Android simulado');
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
