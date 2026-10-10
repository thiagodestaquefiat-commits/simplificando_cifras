const assert = require('node:assert/strict');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  try {
    const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 } });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/**', route => route.fulfill({ json: { enabled: false, songs: [], events: [], bands: [] } }));
    await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ body: '', contentType: 'text/css' }));
    await page.goto('http://127.0.0.1:4173/?assistant-first-delivery-test=1');
    await page.waitForFunction(() => loginGateAuthReady && window.roudyAssistant);
    await page.evaluate(() => {
      continueWithoutLogin();
      musicas.push(songModel.create({ id: 'voice-phase1', title: 'Canção de teste', artist: 'Autor', key: 'G', blocos: Array.from({ length: 20 }, () => ({ l: 'Verso', c: 'G C D' })), fullChordSheet: { source: 'user_text', content: 'G C D\nLetra original' } }));
      commitSongs(musicas);openDetail('voice-phase1');
      window.__youtubeQueries = [];
      window.youtubeApi = Object.freeze({ ...youtubeApi, searchVideos: async query => { window.__youtubeQueries.push(query);return [{ youtubeVideoId: 'abcdefghijk', title: 'Gravação de teste', artist: 'Autor', youtubeChannelTitle: 'Canal', youtubeUrl: 'https://www.youtube.com/watch?v=abcdefghijk' }]; } });
    });
    const run = (text, options) => page.evaluate(({ text, options }) => roudyAssistant.run(text, options), { text, options });
    assert.equal((await run('capotraste na casa dois')).action, 'song.capo');
    assert.equal((await run('subir o tom')).ok, true);
    assert.equal((await run('metrônomo em noventa e seis')).ok, true);
    assert.equal((await run('salvar essas alterações')).saveScope, 'playlist-personal');
    assert.equal(await page.locator('#detail-save-changes').isVisible(), false);
    await page.evaluate(() => { closeDetail();openDetail('voice-phase1'); });
    assert.deepEqual(await page.evaluate(() => ({ capo: selectedCapo, semitones: currentSemitones, bpm: studyMetronome.getBpm() })), { capo: 2, semitones: 1, bpm: 96 });
    await run('subir tom', { requestId: 'same-speech' });
    assert.equal((await run('subir tom', { requestId: 'same-speech' })).duplicate, true);
    assert.equal(await page.evaluate(() => currentSemitones), 2);
    await run('descer tom');
    const youtubeResult = await run('buscar no YouTube Canção de teste');
    assert.equal(youtubeResult.action, 'search.youtube');assert.equal(youtubeResult.ok, true);
    assert.equal(await page.locator('#youtube-song-search-input').isVisible(), true, 'uses the existing song video selector');
    assert.equal(await page.evaluate(() => window.__youtubeQueries.length), 1);
    assert.equal(await page.evaluate(() => musicas.find(song => song.id === 'voice-phase1').youtubeVideoId || null), null, 'search does not save a video automatically');
    assert.equal((await run('não excluir essa música')).ok, false);
    assert.equal((await run('iniciar metrônomo e parar rolagem')).ok, false);
    await page.evaluate(() => editMusica('voice-phase1'));
    assert.equal((await run('salvar alterações')).status, 'blocked', 'detail save must not save a different editor draft');
    await page.evaluate(() => closeModal());
    await page.evaluate(() => {
      window.__playlistBefore = JSON.stringify(musicas);
      const song = musicas.find(song => song.id === 'voice-phase1');
      const date = new Date();date.setDate(date.getDate() + 1);
      setlists.push(eventModel.create({ id: 'voice-event', title: 'Evento de teste', date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`, leaderId: appCurrentUser.id, members: [{ ...appCurrentUser, isLeader: true }], repertoire: [{ id: 'voice-item', songId: song.id, shared: eventEditFromSong(eventSongCopy(song)) }] }));
      closeDetail();openDetailFromEventItem('voice-event', 'voice-item');
    });
    await run('capotraste na casa quatro');await run('bpm 111');
    const saved = await run('salvar alterações');
    assert.equal(saved.ok, true);assert.equal(saved.saveScope, 'event-personal');
    assert.equal(await page.evaluate(() => JSON.stringify(musicas) === window.__playlistBefore), true, 'event save never modifies the playlist');
    await page.evaluate(() => { closeDetail();openDetailFromEventItem('voice-event', 'voice-item'); });
    assert.equal(await page.evaluate(() => selectedCapo), 4);assert.equal(await page.evaluate(() => studyMetronome.getBpm()), 111);
    await page.evaluate(() => {
      window.__collaboration = eventCollaboration;
      findEvent('voice-event').remoteVersion = 1;
      window.eventCollaboration = Object.freeze({ ...eventCollaboration, savePersonalItem: updated => new Promise(resolve => { window.__finishPersonal = () => resolve(updated); }) });
      selectCapo(5);
    });
    const saving = run('salvar alterações');
    await page.waitForFunction(() => Boolean(window.__finishPersonal));
    await page.evaluate(() => { selectCapo(6);window.__finishPersonal(); });
    assert.equal((await saving).pendingChanges, true, 'a manual change made while saving remains pending');
    assert.equal(await page.evaluate(() => selectedCapo), 6);
    assert.equal(await page.locator('#detail-save-changes').isVisible(), true);
    assert.equal(await page.evaluate(() => findEvent('voice-event').repertoire[0].personalEdits[appCurrentUser.id].songData.playbackSettings.capo), 5, 'only the state submitted to save is persisted');
    const savingBeforeEditor = run('salvar alterações');
    await page.waitForFunction(() => Boolean(window.__finishPersonal));
    await page.evaluate(() => { editMusica('voice-phase1');document.getElementById('ai-review-title').value='Rascunho novo no editor';window.__finishPersonal(); });
    assert.equal((await savingBeforeEditor).status, 'blocked', 'opening another editor changes the operation context');
    assert.equal(await page.locator('#ai-review-title').inputValue(), 'Rascunho novo no editor');
    assert.equal(await page.locator('#ai-review-title').isVisible(), true, 'the older save must not close a newer editor');
    await page.evaluate(() => closeModal());
    await page.evaluate(() => { window.eventCollaboration = window.__collaboration;findEvent('voice-event').remoteVersion = null; });
    await page.evaluate(() => { closeDetail();currentSdId='voice-event';document.getElementById('view-sd').style.display='flex';openDetail('voice-phase1');transpose(1); });
    assert.equal((await run('salvar alterações')).saveScope, 'playlist-personal', 'a stale event screen behind the song does not change the save scope');
    await page.evaluate(() => {
      closeDetail();openDetail('voice-phase1');transpose(1);
      window.__repository = songRepository;
      window.songRepository = Object.freeze({ ...songRepository, save: () => false });
    });
    assert.equal((await run('salvar alterações')).ok, false, 'storage failure is not announced as a successful save');
    assert.equal(await page.locator('#detail-save-changes').isVisible(), true);
    await page.evaluate(() => { window.songRepository = window.__repository; });
    await page.evaluate(() => {
      window.__oldIntentClient = roudyIntentClient;
      window.roudyIntentClient = Object.freeze({ ...roudyIntentClient, resolve: () => new Promise(resolve => { window.__finishIntent = resolve; }) });
    });
    const pending = run('o que tem amanhã');
    await page.waitForFunction(() => Boolean(window.__finishIntent));
    await page.evaluate(() => { appCurrentUser = Object.freeze({ ...appCurrentUser, id: 'different-account' });window.__finishIntent({ action: 'inform', message: 'Resposta antiga.' }); });
    assert.equal((await pending).status, 'blocked', 'a delayed result cannot execute after account change');
    assert.deepEqual(errors, []);
    console.log('assistant-first-delivery-ui: OK (real song controls, voice save, event isolation, YouTube, editor guard, quota and account change)');
  } finally { await browser.close(); }
})().catch(error => { console.error(error);process.exitCode = 1; });
