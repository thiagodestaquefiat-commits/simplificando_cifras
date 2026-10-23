// Real Flask routes and database, three isolated browser accounts. No production traffic.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname, file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return res.writeHead(404).end();
  const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png' };
  res.writeHead(200, { 'Content-Type': (types[path.extname(file)] || 'application/octet-stream') + '; charset=utf-8' }); fs.createReadStream(file).pipe(res);
});
(async () => {
  let browser;
  const backend = spawn(path.join(root, 'backend/.venv/Scripts/python.exe'), ['-B', '-u', 'tests/playlist-collaboration-server.py'], { cwd: root, windowsHide: true, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
  try {
    const fixture = await new Promise((resolve, reject) => {
      let stdout = '', stderr = ''; const timeout = setTimeout(() => reject(new Error('Backend fixture timeout: ' + stderr)), 20000);
      backend.stdout.on('data', chunk => { stdout += chunk; for (const line of stdout.split('\n')) if (line.startsWith('{"port"')) { clearTimeout(timeout); resolve(JSON.parse(line)); return; } });
      backend.stderr.on('data', chunk => { stderr += chunk; }); backend.on('error', reject);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
    const errors = [];
    async function pageFor(id) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' }), page = await context.newPage();
      page.on('pageerror', error => errors.push(error.message));
      await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }));
      await page.route('**/api/**', async route => {
        const request = route.request(), url = new URL(request.url());
        if (url.pathname.startsWith('/api/collaborative-playlists') || url.pathname.startsWith('/api/shared-playlists') || url.pathname === '/api/collaboration/directory/users') {
          const response = await context.request.fetch(`http://127.0.0.1:${fixture.port}${url.pathname}${url.search}`, { method: request.method(), headers: request.headers(), data: request.postData() || undefined });
          return route.fulfill({ status: response.status(), contentType: 'application/json', body: await response.body() });
        }
        return route.fulfill({ contentType: 'application/json', body: '{}' });
      });
      await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: 'Continuar sem login' }).click();
      await page.evaluate(({ id, token }) => {
        const state = { authenticated: true, user: { id, name: id.replace('test-', '') } };
        window.appAuth = { getState: () => state, getAccessToken: () => token, subscribe() {} };
        appCurrentUser = { id, name: state.user.name }; switchTab('musicas');
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async value => { window.copiedInvite = value; } } });
        Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
      }, { id, token: fixture.tokens[id] });
      return page;
    }
    const ana = await pageFor('test-ana'), bruno = await pageFor('test-bruno'), carol = await pageFor('test-carol');
    const playlistId = await ana.evaluate(() => {
      const p = userPlaylists.create(homePlaylists.ownerId, 'Ensaio compartilhado', [{ songId: musicas[0].id }, { songId: musicas[1].id }]);
      homePlaylists.open(p.id); return p.id;
    });
    await ana.getByRole('button', { name: 'Adicionar pessoa à playlist' }).click();
    fs.mkdirSync(path.join(root, 'artifacts'), { recursive: true });
    await ana.screenshot({ path: path.join(root, 'artifacts/playlist-invite-actions-mobile.png') });
    await ana.locator('[data-playlist-search]').click();
    await ana.screenshot({ path: path.join(root, 'artifacts/playlist-invite-search-mobile.png') });
    await ana.getByRole('searchbox', { name: 'Buscar por nome ou nome de usuário' }).fill('@bruno');
    await ana.locator('[data-playlist-user]').first().waitFor({ timeout: 6000 }).catch(async error => { throw new Error((await ana.locator('#playlist-invite-status').textContent()) + ' | ' + errors.join('; ') + ' | ' + error.message); });
    await ana.locator('[data-playlist-user]').first().click();
    await ana.evaluate(()=>{
      window.originalPlaylistCollaboration=playlistCollaboration;
      window.playlistCollaboration={...playlistCollaboration,invite:async()=>{throw new Error('Falha de conexão no teste.');}};
    });
    await ana.screenshot({path:path.join(root,'artifacts/playlist-invite-profile-compact.png')});
    assert.equal(await ana.locator('.playlist-invite-profile').count(),1,'perfil usa a confirmação compacta dedicada');
    await ana.getByRole('button', { name: 'Enviar convite', exact: true }).click();
    await ana.getByText('Falha de conexão no teste.', { exact: true }).waitFor();
    assert.equal(await ana.locator('#playlist-invite-layer').count(),1,'falha mantém o convite aberto para nova tentativa');
    assert.equal(await ana.locator('#playlist-send-invite').isEnabled(),true,'falha reabilita o envio');
    await ana.evaluate(()=>{window.playlistCollaboration=window.originalPlaylistCollaboration;delete window.originalPlaylistCollaboration;});
    await ana.getByRole('button', { name: 'Enviar convite', exact: true }).click();
    await ana.getByText('Convite enviado. A pessoa entrará após aceitar.', { exact: true }).waitFor();
    assert.equal(await ana.locator('#playlist-invite-layer').count(),0,'sucesso fecha a tela de convite');
    await ana.evaluate(() => playlistInvites.close());
    await bruno.evaluate(async () => { await playlistCollaboration.refresh(true); notificationCenter.open(); });
    assert.equal(await bruno.evaluate(() => playlistCollaboration.getInbox().invitations.length), 1, 'recipient inbox contains the direct invitation');
    await bruno.locator('#playlist-invitations-list button[data-response="accept"]').waitFor({ timeout: 5000 }).catch(async error => { throw new Error(JSON.stringify(await bruno.evaluate(() => ({ inbox: playlistCollaboration.getInbox(), html: document.getElementById('playlist-invitations-list')?.innerHTML, errors: document.getElementById('user-invitations-status')?.textContent }))) + error.message); });
    await bruno.locator('#playlist-invitations-list').getByRole('button', { name: 'Aceitar', exact: true }).click();
    await bruno.locator('.home-playlist-heading h2').filter({ hasText: 'Ensaio compartilhado' }).waitFor();
    assert.equal(await bruno.locator('.home-playlist-member-avatar').count(), 2);
    assert.equal(await bruno.locator('.home-playlist-member-avatar img').count(), 2);
    const before = await ana.evaluate(() => JSON.stringify(musicas));
    await bruno.getByRole('button', { name: 'Ajustar tons das músicas' }).click();
    await bruno.getByRole('button', { name: /Aumentar tom de/ }).first().click();
    await bruno.evaluate(async () => { await playlistCollaboration.flush(); closeEventAdminSheet(); });
    await ana.evaluate(() => playlistCollaboration.refresh(true));
    assert.equal(await ana.evaluate(id => userPlaylists.get(homePlaylists.ownerId, id).items[0].playback.semitones, playlistId), 1);
    assert.equal(await ana.evaluate(() => JSON.stringify(musicas)), before, 'shared edits must not affect personal songs');
    assert.ok(await ana.evaluate(() => playlistCollaboration.getInbox().notifications.some(n => n.actorName === 'Bruno' && n.summary.includes('tom'))));
    await ana.getByRole('button', { name: 'Compartilhar playlist', exact: true }).click();
    await ana.waitForFunction(() => window.copiedInvite?.includes('?playlist='));
    assert.equal(await ana.locator('#playlist-invite-layer').count(), 0, 'Share must not open collaboration invitations');
    assert.equal(await ana.evaluate(() => copiedInvite.includes('playlistInvite=')), false, 'Share grants a copy, not coownership');
    await ana.evaluate(() => { window.copiedInvite = null; });
    await ana.getByRole('button', { name: 'Adicionar pessoa à playlist' }).click();
    await ana.locator('[data-playlist-copy]').click();
    await ana.waitForFunction(() => window.copiedInvite);
    const link = await ana.evaluate(() => copiedInvite);
    await carol.evaluate(link => { history.replaceState(null, '', link); playlistInvites.checkLink(); }, link);
    await carol.getByRole('button', { name: 'Aceitar convite', exact: true }).click();
    await carol.locator('.home-playlist-heading h2').filter({ hasText: 'Ensaio compartilhado' }).waitFor();
    assert.equal(await carol.locator('.home-playlist-member-avatar').count(), 3);
    const count = await carol.evaluate(() => musicas.length);
    await carol.evaluate(() => homePlaylists.play());
    await carol.locator('#view-detail').waitFor({ state: 'visible' });
    const firstTitle = await carol.locator('#detail-title').textContent();
    await carol.evaluate(() => navigateSong(1));
    assert.notEqual(await carol.locator('#detail-title').textContent(), firstTitle, 'next song uses the shared snapshot without adding it to the personal library');
    await carol.evaluate(async () => {
      const source = currentDetailSongOverride;
      await commitInlineSongEdit(source, { ...source, fullChordSheet: { content: '[Verso]\nG\nTexto compartilhado', source: 'user_text', sections: [] } }, 'Cifra salva');
      await playlistCollaboration.flush();
    });
    await ana.evaluate(() => playlistCollaboration.refresh(true));
    assert.equal(await ana.evaluate(id => userPlaylists.get(homePlaylists.ownerId, id).items[1].song.fullChordSheet.content.includes('Texto compartilhado'), playlistId), true);
    assert.equal(await ana.evaluate(() => JSON.stringify(musicas)), before, 'inline content edits remain in the shared playlist');
    assert.equal(await carol.evaluate(() => musicas.length), count);
    await carol.evaluate(() => closeDetail());
    fs.mkdirSync(path.join(root, 'artifacts'), { recursive: true });
    await carol.screenshot({ path: path.join(root, 'artifacts/playlist-collaborators-mobile.png') });
    await carol.evaluate(async () => { userPlaylists.remove(homePlaylists.ownerId, homePlaylists.currentPlaylistId); await playlistCollaboration.flush(); });
    await ana.evaluate(() => playlistCollaboration.refresh(true));
    assert.equal(await ana.evaluate(id => userPlaylists.get(homePlaylists.ownerId, id), playlistId), null);
    assert.ok(await ana.evaluate(() => playlistCollaboration.getInbox().notifications.some(n => n.actorName === 'Carol' && n.summary.includes('excluiu'))));
    assert.deepEqual(errors, []);
    console.log('playlist-collaboration-ui.test.js: OK (real API, 3 accounts, search, notifications, acceptance, link, avatars, tone, song screen, library isolation)');
  } finally { await browser?.close(); backend.kill(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
