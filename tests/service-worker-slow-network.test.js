// Abrir o app com internet fraca: a página principal não pode ficar esperando a rede para sempre.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../service-worker.js'), 'utf8')
  .replace(/const NAVIGATION_TIMEOUT_MS = \d+;/, 'const NAVIGATION_TIMEOUT_MS = 50;');

function load(fetchImpl, cachedShell) {
  const handlers = {};
  const puts = [];
  vm.runInNewContext(source, {
    URL, setTimeout, Promise, Response: { error: () => 'error' },
    fetch: fetchImpl,
    caches: {
      match: async () => cachedShell,
      open: async () => ({ put: async (key) => puts.push(key) }),
      keys: async () => []
    },
    self: { location: { origin: 'https://roudy.test' }, addEventListener: (name, handler) => { handlers[name] = handler; } }
  });
  return { handlers, puts };
}

function navigate(handlers, url = 'https://roudy.test/') {
  let responded;
  const waited = [];
  handlers.fetch({
    request: { method: 'GET', url, mode: 'navigate' },
    respondWith(promise) { responded = promise; },
    waitUntil(promise) { waited.push(promise); }
  });
  return { responded, waited };
}

(async () => {
  const okResponse = { status: 200, clone() { return this; }, label: 'rede' };

  // Rede rápida: usa a resposta da rede e guarda a cópia.
  {
    const { handlers, puts } = load(async () => okResponse, 'copia');
    const { responded } = navigate(handlers);
    assert.equal((await responded).label, 'rede');
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.deepEqual(puts, ['./index.html']);
  }

  // Rede lenta com cópia guardada: abre a cópia sem esperar a rede.
  {
    const slow = () => new Promise((resolve) => setTimeout(() => resolve(okResponse), 500));
    const { handlers } = load(slow, 'copia');
    const started = Date.now();
    const { responded, waited } = navigate(handlers);
    assert.equal(await responded, 'copia');
    assert.ok(Date.now() - started < 400, 'a cópia deve abrir antes da rede responder');
    assert.equal(waited.length, 1, 'a rede continua atualizando a cópia em segundo plano');
  }

  // Rede lenta sem cópia (primeira abertura): espera a rede.
  {
    const slow = () => new Promise((resolve) => setTimeout(() => resolve(okResponse), 120));
    const { handlers } = load(slow, undefined);
    const { responded } = navigate(handlers);
    assert.equal((await responded).label, 'rede');
  }

  // Sem internet: abre a cópia.
  {
    const { handlers } = load(async () => { throw new Error('offline'); }, 'copia');
    const { responded } = navigate(handlers);
    assert.equal(await responded, 'copia');
  }

  // Termos, Privacidade e Excluir conta continuam indo direto à rede.
  {
    const { handlers } = load(async () => okResponse, 'copia');
    const { responded } = navigate(handlers, 'https://roudy.test/termos.html');
    assert.equal((await responded).label, 'rede');
  }

  console.log('service-worker-slow-network.test.js: OK');
})().catch((error) => { console.error(error); process.exit(1); });
