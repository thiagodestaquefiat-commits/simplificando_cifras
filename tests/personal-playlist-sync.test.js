// Dois aparelhos da mesma conta (celular e PC) sincronizando playlists pessoais.
// O "servidor" abaixo segue as regras de /api/personal-playlists (versão, 409, exclusão lógica).
const assert = require("node:assert/strict");
const same = (a, b, message) => assert.equal(JSON.stringify(a), JSON.stringify(b), message);
const fs = require("node:fs");
const vm = require("node:vm");

const server = new Map(); // clientId -> { clientId, version, deleted, data, updatedAt }
let serverCalls = 0, getCount = 0, unchangedCount = 0;
function serve(method, path, body) {
  serverCalls++;
  const id = decodeURIComponent(path.slice(1));
  if (method === "GET") {
    const cursor = JSON.stringify([...server.values()].map((row) => [row.clientId, row.version, row.deleted]).sort());
    getCount++;
    if (path.startsWith("?since=") && decodeURIComponent(path.slice(7)) === cursor) { unchangedCount++; return [200, { unchanged: true, cursor }]; }
    return [200, { cursor, playlists: [...server.values()].map((row) => structuredClone(row)) }];
  }
  const row = server.get(id);
  if (method === "PUT") {
    if (!row) { const created = { clientId: id, version: 1, deleted: false, data: body.data, updatedAt: new Date().toISOString() }; server.set(id, created); return [201, { playlist: structuredClone(created) }]; }
    if (body.baseVersion !== row.version && !body.force) return [409, { erro: { codigo: "versao_desatualizada" }, playlist: structuredClone(row) }];
    Object.assign(row, { data: body.data, deleted: false, version: row.version + 1, updatedAt: new Date().toISOString() });
    return [200, { playlist: structuredClone(row) }];
  }
  if (method === "DELETE") {
    if (!row) return [200, { playlist: null }];
    if (body?.baseVersion != null && body.baseVersion !== row.version) return [409, { playlist: structuredClone(row) }];
    Object.assign(row, { deleted: true, version: row.version + 1 });
    return [200, { playlist: structuredClone(row) }];
  }
  throw new Error("rota inesperada");
}

function device(name, librarySongs) {
  const local = new Map();
  const sandbox = {
    console, structuredClone, setTimeout: () => 0, clearTimeout() {}, setInterval() {},
    addEventListener() {}, document: { hidden: false, addEventListener() {} }, navigator: { onLine: true },
    storage: {
      get(key, fallback) { return local.has(key) ? JSON.parse(local.get(key)) : fallback; },
      set(key, value) { if (value === undefined) return false; local.set(key, JSON.stringify(value)); return true; }
    },
    apiConfig: { API_BASE_URL: "https://api" },
    appAuth: { getState: () => ({ authenticated: true, user: { id: "conta-thiago" } }), getAccessToken: () => "token" },
    homePlaylists: { ownerId: "conta-thiago" },
    musicas: librarySongs,
    async fetch(url, options) {
      const [status, body] = serve(options.method, url.replace("https://api/api/personal-playlists", ""), options.body ? JSON.parse(options.body) : null);
      return { ok: status < 300, status, async json() { return body; } };
    }
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync("js/user-playlists.js", "utf8"), sandbox);
  vm.runInContext(fs.readFileSync("js/personal-playlist-sync.js", "utf8"), sandbox);
  return { name, w: sandbox, pl: sandbox.userPlaylists, sync: () => sandbox.personalPlaylistSync.sync(), list: () => sandbox.userPlaylists.list("conta-thiago") };
}

const song = (id, clientId, title) => ({ id, title, artist: "Artista", key: "G", librarySync: { clientId } });
// Mesmas músicas, ids locais diferentes em cada aparelho (só o clientId da biblioteca é igual).
const phone = device("celular", [song("p1", "c-grat", "Gratidão"), song("p2", "c-isaias", "Isaías 9"), song("p3", "c-rei", "Rei")]);
const pc = device("pc", [song("x9", "c-grat", "Gratidão"), song("x8", "c-isaias", "Isaías 9")]); // "Rei" ainda não chegou no PC

(async () => {
  const OWNER = "conta-thiago";
  // 1) Celular tem playlists antigas (sem nuvem) → sobem.
  const louvores = phone.pl.create(OWNER, "Louvores", [{ songId: "p1", playback: { semitones: -2 } }, { songId: "p2" }, { songId: "p3", playback: { capo: 2 } }]);
  phone.pl.create(OWNER, "Músicas", [{ songId: "p2" }]);
  await phone.sync();
  assert.equal(server.size, 2, "as duas playlists subiram");
  const up = server.get(louvores.id).data;
  same(up.items.map((i) => i.songClientId), ["c-grat", "c-isaias", "c-rei"], "vai só a referência da música");
  assert.equal(up.items[0].song, undefined, "não envia a música inteira");

  // 2) PC baixa as playlists, apontando para as músicas da biblioteca dele.
  await pc.sync();
  const pcLouvores = pc.list().find((p) => p.name === "Louvores");
  assert.ok(pcLouvores, "Louvores apareceu no PC");
  same(pcLouvores.items.map((i) => i.songId), ["x9", "x8", "c-rei"], "usa a música local; a que falta fica pelo clientId");
  assert.equal(pcLouvores.items[0].playback.semitones, -2, "tom da playlist preservado");
  assert.equal(pc.list().length, 2);

  // 3) Sincronizar de novo sem mudanças não envia nada (sem ping-pong).
  const before = serverCalls;
  await pc.sync(); await phone.sync(); await pc.sync();
  assert.equal(serverCalls - before, 3, "só as 3 leituras, nenhuma gravação");
  const unchangedBefore = unchangedCount;
  await pc.sync();
  assert.equal(unchangedCount - unchangedBefore, 1, "consulta sem mudanças não baixa as playlists de novo");

  // 4) PC muda o tom de um item → celular recebe.
  pc.pl.setItemPlayback(OWNER, pcLouvores.id, pcLouvores.items[1].id, { semitones: 3 });
  await pc.sync();
  await phone.sync();
  const phoneLouvores = phone.list().find((p) => p.name === "Louvores");
  assert.equal(phoneLouvores.items[1].playback.semitones, 3, "tom alterado no PC chegou no celular");
  assert.equal(phoneLouvores.items[1].songId, "p2", "continua apontando para a música do celular");

  // 5) Alteração local pendente não é trocada pela da nuvem: o celular renomeia offline enquanto o PC muda a capa.
  const wait = (ms) => new Promise((resolve) => global.setTimeout(resolve, ms));
  pc.pl.setPinned(OWNER, pcLouvores.id, false);
  await pc.sync();
  await wait(5);
  phone.pl.rename(OWNER, phoneLouvores.id, "Louvores domingo"); // editada depois, sem ter recebido a do PC
  await phone.sync(); // conflito: fica a edição mais recente (a do celular)
  await pc.sync();
  assert.equal(pc.list().find((p) => p.id === pcLouvores.id).name, "Louvores domingo", "a edição mais recente vence");
  // E o contrário: edição do PC mais recente vence a do celular.
  phone.pl.setPinned(OWNER, phoneLouvores.id, true);
  await wait(5);
  pc.pl.rename(OWNER, pcLouvores.id, "Louvores PC");
  await pc.sync(); await phone.sync();
  assert.equal(phone.list().find((p) => p.id === phoneLouvores.id).name, "Louvores PC");

  // 6) Excluir no celular exclui no PC.
  const musicas = phone.list().find((p) => p.name === "Músicas");
  phone.pl.remove(OWNER, musicas.id);
  await phone.sync();
  assert.equal(server.get(musicas.id).deleted, true);
  await pc.sync();
  assert.ok(!pc.list().some((p) => p.id === musicas.id), "excluída no PC também");
  await phone.sync();
  assert.ok(!phone.list().some((p) => p.id === musicas.id), "não volta no celular");

  // 7) Playlist nova criada no PC aparece no celular.
  pc.pl.create(OWNER, "Ensaio", [{ songId: "x9" }]);
  await pc.sync(); await phone.sync();
  const ensaio = phone.list().find((p) => p.name === "Ensaio");
  assert.equal(ensaio.items[0].songId, "p1", "aponta para a Gratidão do celular");

  // 8) O caso real de 24/10: as playlists somem do aparelho (armazenamento corrompido/limpo).
  //    A sincronização NÃO pode apagar na nuvem: tem de baixar de volta.
  const beforeVanish = phone.list().map((p) => p.name).sort();
  phone.w.storage.set("sc_user_playlists_v1", {});
  await phone.sync();
  assert.ok([...server.values()].filter((row) => !row.deleted).length >= 2, "nada foi apagado na nuvem");
  same(phone.list().map((p) => p.name).sort(), beforeVanish, "as playlists voltaram para o aparelho");

  // 9) Recuperação: playlist apagada na nuvem pelo erro (janela de 24/10) volta, uma vez.
  const victim = [...server.values()].find((row) => row.data.name === "Ensaio");
  Object.assign(victim, { deleted: true, version: victim.version + 1, updatedAt: "2026-10-24T17:00:00.000Z" });
  const freshPhone = device("celular-novo", [song("p1", "c-grat", "Gratidão")]);
  await freshPhone.sync();
  assert.equal(server.get(victim.clientId).deleted, false, "restaurada na nuvem");
  assert.ok(freshPhone.list().some((p) => p.name === "Ensaio"), "e baixada no aparelho");
  // Exclusão feita pela pessoa depois disso continua valendo.
  const ensaioLocal = freshPhone.list().find((p) => p.name === "Ensaio");
  freshPhone.pl.remove(OWNER, ensaioLocal.id);
  await freshPhone.sync();
  assert.equal(server.get(victim.clientId).deleted, true, "exclusão de verdade apaga na nuvem");
  await freshPhone.sync();
  assert.ok(!freshPhone.list().some((p) => p.name === "Ensaio"), "e não volta");

  console.log("personal-playlist-sync.test.js: OK");
})().catch((error) => { console.error(error); process.exit(1); });
