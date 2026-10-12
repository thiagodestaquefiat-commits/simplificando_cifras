(function (global) {
  'use strict';
  // Deliberately limited to verified scalar adjustments. No remote rollback.
  function create({ manager, context, normalize, snapshot, restore, now = () => Date.now() }) {
    const result = global.roudyActionManager.result;
    const fields = Object.freeze({
      'song.capo': 'capo', 'song.transpose': 'semitones', 'song.reset-key': 'semitones',
      'metronome.bpm': 'bpm', 'metronome.adjust': 'bpm', 'metronome.meter': 'meter',
      'settings.color': 'chordColor', 'settings.language': 'language', 'settings.theme': 'theme',
      'settings.scale': 'scale', 'settings.accessibility': null
    });
    const songFields = new Set(['capo', 'semitones', 'bpm', 'meter']);
    const identity = c => JSON.stringify([c.ownerId, c.authSubject, c.libraryOwner, c.ready]);
    const scope = c => JSON.stringify([identity(c), c.screen, c.songOpen, c.songId, c.eventId, c.itemId, c.canEditSong, c.editorOpen, c.dialogueScope]);
    const seen = new Map();
    let history = null, last = null, lastOwner = null, lastScope = null, busy = false;
    function sync() {
      const c = context(), owner = identity(c), target = scope(c);
      if (owner !== lastOwner) { seen.clear(); history = null; last = null; }
      if (target !== lastScope) history = null;
      lastOwner = owner; lastScope = target;
      return target;
    }
    const undoPhrase = raw => /^(?:desfazer|desfaca|desfaz|desfazer a ultima alteracao|desfaca a ultima alteracao|desfaz a ultima alteracao|desfazer ultimo ajuste|desfaca o ultimo ajuste|voltar ao ajuste anterior)$/.test(normalize(raw));
    function split(raw) {
      if (typeof raw !== 'string' || raw.length > 500) return null;
      // Keep original punctuation and polarity for each native parser. Never split number conjunctions.
      const text = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      let start = '(?:(?:o |a )?(?:capotraste|capo|bpm|metronomo|ritmo|andamento|compasso|tema|idioma|escala|cor da cifra)\\b|(?:abrir|abra|abre|iniciar|ativar|ligar|parar|pare|mudar|mude|trocar|troque|ajustar|ajuste|definir|defina|colocar|coloque|coloca|usar|deixar|configurar|ponha|salvar|salve|excluir|apagar|buscar|pesquisar|convidar|subir|descer|aumentar|aumente|diminuir|diminua|gerar|importar|exportar|sincronizar|desfazer|desfaca)\\b)';
      const extra=global.roudyAssistantLanguage?.boundaryVerbs?.join('|');if(extra)start+=`|(?:${extra})\\b`;
      const boundary = new RegExp(`\\s*(?:;|,\\s*(?=${start})|\\b(?:e depois|depois|em seguida)\\b|\\be\\s+(?=${start}))\\s*`, 'g');
      const parts = []; let from = 0, match;
      while ((match = boundary.exec(text))) { parts.push(raw.slice(from, match.index).trim()); from = boundary.lastIndex; }
      parts.push(raw.slice(from).trim());
      return parts;
    }
    function field(resolved) { return resolved.definition.id === 'settings.accessibility' ? resolved.slots.key : fields[resolved.definition.id]; }
    function eligible(resolved) {
      if (!resolved.definition || !Object.hasOwn(fields, resolved.definition.id)) return false;
      return !(songFields.has(field(resolved)) && !context().songOpen) && !resolved.slots.start;
    }
    function desired(resolved, before) {
      const {id} = resolved.definition, {slots} = resolved, key = field(resolved);
      if(id==='song.reset-key')return 0;
      if(id==='song.transpose')return Math.max(-11,Math.min(11,before[key]+slots.delta));
      if(id==='metronome.adjust')return Math.max(30,Math.min(240,before[key]+slots.delta));
      return slots.value;
    }
    function plan(raw) {
      const parts = split(raw);
      if (!parts || parts.length < 2) return null;
      if (parts.length > 3 || parts.some(p => !p)) return { error: 'Use até três ações completas em um pedido.' };
      const actions = parts.map(command => ({ command, resolved: manager.preview(command) }));
      const invalid = actions.find(({ resolved }) => !resolved.definition);
      if (invalid) return { error: `Não iniciei a sequência. ${invalid.resolved.message}` };
      for (let i = 0; i < actions.length; i++) {
        const resolved = actions[i].resolved;
        if (resolved.definition.id === 'song.save') {
          if (i !== actions.length - 1 || !actions.slice(0, i).some(a => songFields.has(field(a.resolved)))) return { error: 'Salvar deve ser a última etapa, após um ajuste da música.' };
        } else if (!eligible(resolved)) return { error: 'Nesta etapa, combine apenas ajustes de tom, capotraste, BPM, compasso, cor, idioma, tema ou acessibilidade. Peça as outras ações separadamente.' };
      }
      const touched = actions.filter(a => a.resolved.definition.id !== 'song.save').map(a => field(a.resolved));
      if (new Set(touched).size !== touched.length) return { error: 'Há dois ajustes para o mesmo controle. Diga o valor final desejado.' };
      return { actions };
    }
    const synthetic = id => ({ definition: { id, risk: 'draft-write', priority: 110 }, slots: {} });
    function resolve(raw) {
      if (typeof raw !== 'string' || raw.length > 500) return manager.resolve(raw);
      if (undoPhrase(raw)) return synthetic('assistant.undo');
      // Even rejected sequences are explicit new requests, never slot answers.
      return plan(raw) ? synthetic('assistant.sequence') : manager.resolve(raw);
    }
    async function undo() {
      const target = sync(), entry = history;
      if (!entry || entry.scope !== target) return result('blocked', 'Não há um ajuste por voz para desfazer nesta tela.');
      if (context().ready === false || context().editorOpen || Object.keys(entry.before).some(k => songFields.has(k)) && !context().canEditSong) return result('blocked', 'Conclua o editor ou reabra a música antes de desfazer.');
      const current = snapshot();
      if (Object.keys(entry.after).some(k => current[k] !== entry.after[k])) { history = null; return result('blocked', 'Esse ajuste mudou depois do comando. Preservei as alterações atuais; não desfiz nada.'); }
      const guard = () => { if (scope(context()) !== target) throw new Error('Context changed'); };
      const restored = [];
      try {
        for (const [key, value] of Object.entries(entry.before)) {
          guard();
          if (snapshot()[key] !== entry.after[key]) throw new Error('Adjustment changed');
          await restore(key, value, guard); guard();
          if (snapshot()[key] !== value) throw new Error('Not restored');
          restored.push(key);
        }
        history = null;
        return result('executed', Object.keys(entry.before).some(k => songFields.has(k)) ? 'Desfiz os ajustes por voz. Para guardar esse estado da música, diga salvar alterações.' : 'Desfiz os ajustes por voz.', { action: 'assistant.undo' });
      } catch (_) {
        history = null;
        return result('error', `Não consegui concluir o desfazer. ${restored.length} de ${Object.keys(entry.before).length} ajustes foram restaurados. Confira a tela.`, { action: 'assistant.undo', restored: restored.length });
      }
    }
    async function run(raw, options = {}) {
      const target = sync(), owner = identity(context()), cacheKey = options.requestId ? owner + ':' + String(options.requestId) : null;
      const cached = cacheKey && seen.get(cacheKey);
      if (cached && now() - cached.time < 60000) return { ...cached.output, duplicate: true, silent: true };
      if (busy) return result('blocked', 'Um comando já está sendo executado.');
      busy = true; let output;
      try {
        if (typeof raw === 'string' && raw.length <= 500 && undoPhrase(raw)) output = await undo();
        else {
          const sequence = plan(raw);
          if (sequence?.error) output = result('blocked', sequence.error, { action: 'assistant.sequence' });
          else {
            const actions = sequence?.actions || [{ command: raw, resolved: manager.preview(raw) }];
            const tracked = actions.filter(a => eligible(a.resolved));
            const before = tracked.length ? snapshot() : null;
            const steps = [], expected = before ? {...before} : null, recordedBefore = {}, recordedAfter = {}; let failed = false;
            for (let i = 0; i < actions.length; i++) {
              if (scope(context()) !== target) { output = result('blocked', 'A tela ou a conta mudou. Parei a sequência.'); failed = true; break; }
              if (sequence && tracked.some(a => snapshot()[field(a.resolved)] !== expected[field(a.resolved)])) { output = result('blocked','Um dos ajustes mudou durante o pedido. Preservei a alteração atual e parei antes da próxima etapa.'); failed = true; break; }
              const currentAction=actions[i], key=eligible(currentAction.resolved)?field(currentAction.resolved):null, wanted=key?desired(currentAction.resolved,expected):null;
              output = await manager.run(actions[i].command, { ...options, requestId: options.requestId ? `${options.requestId}:step:${i}` : undefined });
              steps.push(output);
              if (key && scope(context())===target && snapshot()[key]===wanted) {
                if(before[key]!==wanted){recordedBefore[key]=before[key];recordedAfter[key]=wanted;}
                expected[key]=wanted;
              }
              if (!output.ok || output.pendingChanges) { failed = true; break; }
            }
            const sameTarget = scope(context()) === target;
            if (before && sameTarget) {
              // Record only verified desired values, never an intervening manual edit.
              if (Object.keys(recordedBefore).length) history = { scope: target, before: recordedBefore, after: recordedAfter };
            } else if (!sameTarget || actions.some(a => a.resolved.definition && !eligible(a.resolved) && a.resolved.definition.id !== 'song.save' && a.resolved.definition.id !== 'assistant.help')) history = null;
            if (sequence) output = result(failed ? 'error' : 'executed', failed ? `Sequência interrompida. ${steps.filter(s => s.ok).length} de ${actions.length} etapas concluídas. ${output.message}` : steps.map((s, i) => `${i + 1}: ${s.message}`).join(' '), { action: 'assistant.sequence', steps, completed: steps.filter(s => s.ok).length });
          }
        }
      } catch (_) { history = null; output = result('error', 'Não consegui confirmar os ajustes. Confira a tela antes de repetir.'); }
      finally { busy = false; }
      if (identity(context()) === owner) {
        last = output;
        if (cacheKey) { seen.set(cacheKey, { time: now(), output }); while (seen.size > 64) seen.delete(seen.keys().next().value); }
      }
      return output;
    }
    return Object.freeze({ run, resolve, sync, getLastResult: () => { sync(); return last; }, getCatalog: () => [...manager.getCatalog(), { id: 'assistant.sequence', category: 'assistant', risk: 'draft-write' }, { id: 'assistant.undo', category: 'assistant', risk: 'draft-write' }] });
  }
  global.roudyAssistantSequences = Object.freeze({ create });
})(window);
