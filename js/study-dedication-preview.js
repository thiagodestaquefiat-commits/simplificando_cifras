// Explicit opt-in on local development or this site's Deploy Preview only.
(function (global) {
  'use strict';
  const allowed = /^(localhost|127\.0\.0\.1|deploy-preview-\d+--simplificandocifras\.netlify\.app)$/.test(location.hostname);
  if (!allowed || new URLSearchParams(location.search).get('dedicationTest') !== '1') return;
  const states = new Map();
  const copy = value => JSON.parse(JSON.stringify(value));
  // Synthetic evidence stays in memory. No real account history is read or written.
  const store = { async update(userId, edit) {
    const next = edit(copy(states.get(userId) || { userId, enabled: true, epoch: 0, sessions: [], lastPresentedAt: null, reservation: null }));
    states.set(userId, copy(next)); return copy(next);
  } };
  async function simulate(kind) {
    const tracker = global.studyPreparation?.tracker, owner = tracker?.snapshot()?.userId;
    if (!owner) throw new Error('Entre na sua conta para testar.');
    if (!['song', 'consistency', 'repertoire'].includes(kind)) throw new Error('Condição inválida.');
    await tracker.end(); await tracker.clear();
    const songs = global.studyPreparation.input().songs, now = Date.now();
    let selected = songs.slice(0, kind === 'song' ? 1 : 2), refs = [];
    if (kind === 'repertoire') {
      const event = setlists.find(event => {
        const matched = (event.repertoire || []).filter(item => songs.some(song => String(song.id) === String(item.songId)));
        if (new Set(matched.map(item => String(item.songId))).size < 2) return false;
        selected = [...new Map(matched.map(item => [String(item.songId), songs.find(song => String(song.id) === String(item.songId))])).values()].slice(0, 2);
        refs = selected.map(song => { const item = matched.find(item => String(item.songId) === String(song.id)); return [{ eventId: String(event.id), itemId: String(item.id), revision: String(item.updatedAt || '') }]; });
        return true;
      });
      if (!event) throw new Error('É necessário um evento acessível com duas músicas da sua biblioteca.');
    }
    if (selected.length < (kind === 'song' ? 1 : 2)) throw new Error('Adicione músicas à sua biblioteca antes de testar.');
    const times = kind === 'consistency' ? [now - 86400000, now - 60000] : [now - 3600000, now - 60000];
    await store.update(owner, state => ({ ...state, sessions: times.map((at, index) => {
      const song = selected[kind === 'song' ? 0 : index];
      return { id: crypto.randomUUID(), songId: String(song.id), songKey: studyEvidence.identity(song), startedAt: at - 90000, qualifiedAt: at, lastEvidenceAt: at, endedAt: at, localDay: studyEvidence.dayKey(at, Intl.DateTimeFormat().resolvedOptions().timeZone), path: 'reading', events: refs[index] || [] };
    }), lastPresentedAt: null, reservation: null }));
    await tracker.refresh(); renderContextualHomeCard();
    return { simulated: kind, action: resolveHomeCardContext().contextAction?.actionType || null, note: 'Avisos operacionais continuam tendo prioridade. Evidências somente em memória.' };
  }
  global.studyDedicationPreview = Object.freeze({ options: { store }, simulate });
  const panel = document.createElement('details');
  panel.style.cssText = 'position:fixed;right:12px;bottom:90px;z-index:9999;background:#252526;color:white;padding:12px;border-radius:12px;max-width:280px;font:14px system-ui';
  panel.innerHTML = '<summary>Teste de dedicação · Preview</summary><p>Evidências fictícias, somente em memória.</p>';
  const status = document.createElement('p'); status.setAttribute('role', 'status');
  for (const [kind, label] of [['song', 'Música'], ['consistency', 'Constância'], ['repertoire', 'Repertório']]) {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
    button.style.cssText = 'min-height:44px;margin:3px;padding:8px';
    button.onclick = async () => {
      try { const result = await simulate(kind); status.textContent = result.action ? `Elegível: ${result.action}. Volte à Home para visualizar.` : 'Evidências criadas. Um aviso operacional pode ter prioridade.'; }
      catch (error) { status.textContent = error.message; }
    };
    panel.append(button);
  }
  panel.append(status); document.body.append(panel);
})(window);
