const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), crypto = require('node:crypto');
function environment() {
  let active = 'ana', saved = {}, fail = false, token = 'token-ana', authListener;
  const requests = [], remotes = new Map();
  const context = { console, URL, AbortController, crypto, structuredClone, setTimeout: () => 1, clearTimeout() {}, setInterval() {}, document: { hidden: false, addEventListener() {} }, navigator: { onLine: true }, addEventListener() {},
    storage: { get: (key, fallback) => saved[key] ? structuredClone(saved[key]) : fallback, set: (key, value) => { if (fail) return false; saved[key] = structuredClone(value); return true; } },
    musicas: [{ id: 1, title: 'Canção', key: 'G', librarySync: { secret: 'private' } }],
    appAuth: { getState: () => ({ authenticated: true, user: { id: active } }), getAccessToken: () => token, subscribe: fn => { authListener = fn; } },
    homePlaylists: { get ownerId() { return active; }, refreshCollaboration() {} }, apiConfig: { API_BASE_URL: 'https://backend.test' }, showToast() {},
    fetch: async (url, options = {}) => {
      requests.push({ url, options });
      const data = JSON.parse(options.body || '{}');
      if (options.method === 'POST' && url.endsWith('/api/collaborative-playlists')) {
        const row = { id: 'remote-one', data: data.data, version: 1, members: [{ id: active, name: 'Ana', role: 'owner' }], createdAt: '2026-10-23', updatedAt: '2026-10-23' };
        remotes.set(row.id, row); return { ok: true, json: async () => ({ playlist: row }) };
      }
      if (url.endsWith('/operations')) {
        const row = remotes.get('remote-one'); row.data = data.data; row.version++;
        return { ok: true, json: async () => ({ playlist: structuredClone(row) }) };
      }
      return { ok: true, json: async () => ({ playlists: [...remotes.values()], invitations: [], notifications: [] }) };
    }
  };
  context.window = context; vm.createContext(context);
  for (const file of ['user-playlists.js', 'playlist-collaboration.js']) vm.runInContext(fs.readFileSync('js/' + file, 'utf8'), context);
  return { context, requests, remotes, fail: value => { fail = value; }, switch: value => { active = value; token = 'token-' + value; authListener(); } };
}
(async () => {
  const env = environment(), { context: c, requests } = env;
  const p = c.userPlaylists.create('ana', 'Ensaio', [{ songId: 1 }]);
  const bound = await c.playlistCollaboration.promote(p.id);
  assert.equal(bound.collaboration.id, 'remote-one');
  assert.equal(requests[0].options.headers.Authorization, 'Bearer token-ana');
  assert.equal(JSON.parse(requests[0].options.body).data.items[0].song.librarySync, undefined);
  c.userPlaylists.rename('ana', p.id, 'Novo nome');
  assert.equal(c.userPlaylists.get('ana', p.id).collaboration.pending.length, 1);
  assert.equal(c.playlistCollaboration.hasPending(), true);
  const before = c.userPlaylists.get('ana', p.id);
  env.fail(true); assert.equal(c.userPlaylists.rename('ana', p.id, 'Não gravado'), null); env.fail(false);
  assert.equal(c.userPlaylists.get('ana', p.id).name, 'Novo nome');
  await c.playlistCollaboration.flush();
  assert.equal(c.playlistCollaboration.hasPending(), false);
  const synced = c.userPlaylists.get('ana', p.id);
  assert.equal(synced.name, 'Novo nome');
  assert.equal(synced.items[0].song.title, 'Canção');
  c.userPlaylists.setItemNotes('ana', p.id, synced.items[0].id, 'Observação');
  // Re-evaluate the modules to simulate closing/reopening without losing storage.
  for (const file of ['user-playlists.js', 'playlist-collaboration.js']) vm.runInContext(fs.readFileSync('js/' + file, 'utf8'), c);
  const op = c.userPlaylists.get('ana', p.id).collaboration.pending[0];
  assert.equal(op.base.items[0].song.id, 1, 'virtual navigation ids must not change canonical song ids');
  env.switch('bruno');
  assert.equal(c.playlistCollaboration.hasPending(), false);
  assert.equal(c.userPlaylists.list('bruno').length, 0);
  env.switch('ana');
  assert.equal(c.playlistCollaboration.hasPending(), true);
  await c.playlistCollaboration.flush();
  c.userPlaylists.remove('ana', p.id);
  assert.equal(c.userPlaylists.list('ana').length, 0);
  assert.equal(c.userPlaylists.all('ana').length, 1, 'deletion tombstone and queue survive locally');
  assert.equal(c.userPlaylists.all('ana')[0].collaboration.pending[0].delete, true);
  assert.equal(c.musicas.length, 1); assert.equal(c.musicas[0].key, 'G');
  console.log('playlist-collaboration.test.js: OK (durable queue, storage failure, isolation, snapshots, tombstones)');
})().catch(error => { console.error(error); process.exitCode = 1; });
