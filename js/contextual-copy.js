(function (global) {
  'use strict';

  const CATALOG = Object.freeze({
    REVIEW_CHANGED_SONG: Object.freeze({
      generic: Object.freeze([
        '{songTitle} mudou desde a sua última preparação. Dá uma conferida?',
        'Teve uma mudança em {songTitle} desde a última vez que você preparou.',
        '{songTitle} ganhou um ajuste depois da sua preparação. Vale revisar.'
      ]),
      keyChange: Object.freeze([
        'O tom de {songTitle} mudou de {before} para {after}. Dá uma conferida?',
        'O tom mudou para {after}. Melhor descobrir aqui do que no primeiro acorde.'
      ])
    }),
    START_PREPARATION: Object.freeze({
      songAdded: Object.freeze(['Música nova no repertório.']),
      songAddedFuture: Object.freeze(['Música nova no repertório. Respira. Ainda dá tempo.']),
      songAddedLastMinute: Object.freeze(['O repertório mudou. Sim, alguém adicionou música em cima da hora.']),
      withCount: Object.freeze([
        '{eventName} está chegando. Tem {pendingCountText} para preparar.',
        'Tem {eventName} chegando. {pendingCountSentence}',
        'Tem {pendingCountText} dando sopa por aqui.'
      ]),
      onePending: Object.freeze(['Tem uma música dando sopa por aqui.']),
      withoutCount: Object.freeze([
        '{eventName} está chegando. Bora preparar o repertório?',
        'Tem {eventName} chegando. Bora dar uma passada no repertório?'
      ]),
      tomorrow: Object.freeze(['Evento amanhã. Nada de descobrir o tom no palco.']),
      today: Object.freeze([
        'É hoje. {pendingCountSentence} para deixar o repertório pronto.',
        'É hoje. Agora menos configuração, mais música.',
        'É hoje. Menos complexidade. Mais música.'
      ])
    }),
    CONTINUE_PREPARATION: Object.freeze({
      songAdded: Object.freeze(['Música nova no repertório.']),
      songAddedFuture: Object.freeze(['Música nova no repertório. Respira. Ainda dá tempo.']),
      songAddedLastMinute: Object.freeze(['O repertório mudou. Sim, alguém adicionou música em cima da hora.']),
      withCount: Object.freeze([
        'Tá quase. {pendingCountSentence} para {eventName}.',
        'Só mais {pendingCountText} e o repertório de {eventName} está pronto.',
        'Bora continuar? {pendingCountSentence} para {eventName}.'
      ]),
      onePending: Object.freeze(['Só falta uma música. Sempre tem uma.']),
      onePendingWithProgress: Object.freeze([
        'Só falta uma música. Sempre tem uma.',
        '{readyCountText} revisadas. Uma sobrevivente.'
      ]),
      twoPending: Object.freeze(['{readyCount} de {totalCount} músicas revisadas. As outras duas sabem quem são.']),
      withoutCount: Object.freeze(['Você já começou a preparação de {eventName}. Bora continuar?']),
      tomorrow: Object.freeze(['Evento amanhã. Nada de descobrir o tom no palco.']),
      today: Object.freeze([
        'É hoje. {pendingCountSentence} para deixar o repertório pronto.',
        'É hoje. Agora menos configuração, mais música.',
        'É hoje. Menos complexidade. Mais música.'
      ])
    }),
    ENTER_STAGE_MODE: Object.freeze({
      today: Object.freeze([
        'Tudo pronto por aqui. Agora é palco.',
        'Repertório pronto. Bora pro palco?',
        'Hoje tem {eventName}. Tudo pronto para o palco.',
        'Tudo certo por aqui. Agora só falta a parte fácil: tocar.',
        'Repertório inteiro revisado. Agora é confiar no ensaio.',
        'Tudo preparado. Pode fechar o app. Sério.',
        'Repertório revisado. ROUDY oficialmente sem assunto.'
      ]),
      generic: Object.freeze(['Preparação feita. Agora é palco.'])
    })
  });

  const ACTION_META = Object.freeze({
    REVIEW_CHANGED_SONG: Object.freeze({ kicker: 'ALTERAÇÃO NO REPERTÓRIO', actionLabel: 'Revisar' }),
    START_PREPARATION: Object.freeze({ kicker: 'PRÓXIMO EVENTO', actionLabel: 'Começar' }),
    CONTINUE_PREPARATION: Object.freeze({ kicker: 'SUA PREPARAÇÃO', actionLabel: 'Continuar' }),
    ENTER_STAGE_MODE: Object.freeze({ kicker: 'EVENTO DE HOJE', actionLabel: 'Modo Palco' })
  });

  function text(value) { return String(value == null ? '' : value).trim(); }
  function safeScalar(value) { return ['string', 'number'].includes(typeof value) && text(value) ? text(value) : ''; }
  function hash(value) { let result = 2166136261; for (const char of text(value)) { result ^= char.charCodeAt(0); result = Math.imul(result, 16777619); } return result >>> 0; }
  function eventFor(action, events) { return (events || []).find(value => text(value && value.id) === text(action && action.eventId)); }
  function variablesFor(action, events) {
    const event = eventFor(action, events), item = event && (event.repertoire || []).find(value => text(value && value.id) === text(action.repertoireItemId));
    const pendingRaw = action && action.evidence && action.evidence.pendingCount, readyRaw = action && action.evidence && action.evidence.readyCount, totalRaw = action && action.evidence && action.evidence.totalCount, changedRaw = action && action.evidence && action.evidence.changedCount, hoursRaw = action && action.evidence && action.evidence.hoursUntil;
    const pendingCount = Number.isInteger(Number(pendingRaw)) && Number(pendingRaw) > 0 ? Number(pendingRaw) : null;
    const readyCount = Number.isInteger(Number(readyRaw)) && Number(readyRaw) >= 0 ? Number(readyRaw) : null;
    const totalCount = Number.isInteger(Number(totalRaw)) && Number(totalRaw) > 0 ? Number(totalRaw) : null;
    const changedCount = Number.isInteger(Number(changedRaw)) && Number(changedRaw) >= 0 ? Number(changedRaw) : null;
    const hoursUntil = Number.isFinite(Number(hoursRaw)) ? Number(hoursRaw) : null;
    return {
      eventName: text(event && event.title) || 'seu evento',
      songTitle: text(item && item.shared && item.shared.title) || 'A música',
      pendingCount,
      readyCount,
      totalCount,
      changedCount,
      hoursUntil,
      pendingCountText: pendingCount == null ? '' : `${pendingCount} ${pendingCount === 1 ? 'música' : 'músicas'}`,
      pendingCountSentence: pendingCount == null ? '' : `${pendingCount === 1 ? 'Falta' : 'Faltam'} ${pendingCount} ${pendingCount === 1 ? 'música' : 'músicas'}`,
      readyCountText: readyCount == null ? '' : `${readyCount} ${readyCount === 1 ? 'música' : 'músicas'}`,
      eventPhase: text(action && action.evidence && action.evidence.eventPhase) || 'UNKNOWN'
    };
  }
  function reliableKeyChange(action) {
    if (!action || action.evidence && action.evidence.evidenceIncomplete) return null;
    const change = (action.evidence && Array.isArray(action.evidence.relevantChanges) ? action.evidence.relevantChanges : []).find(value => text(value && (value.type || value.changeType)) === 'KEY_CHANGED');
    const before = safeScalar(change && change.before), after = safeScalar(change && change.after);
    return before && after && before !== after ? { before, after } : null;
  }
  function reliableSongAddition(action) {
    const changes = action && action.evidence && Array.isArray(action.evidence.relevantChanges) ? action.evidence.relevantChanges : [];
    return changes.find(value => text(value && (value.type || value.changeType)) === 'SONG_ADDED') || null;
  }
  function familyFor(action, variables) {
    if (action.actionType === 'REVIEW_CHANGED_SONG') return reliableKeyChange(action) ? 'keyChange' : 'generic';
    if (action.actionType === 'ENTER_STAGE_MODE') return variables.eventPhase === 'TODAY' && text(action.evidence && action.evidence.state) === 'READY' ? 'today' : null;
    if (['START_PREPARATION', 'CONTINUE_PREPARATION'].includes(action.actionType)) {
      const addition = reliableSongAddition(action);
      if (addition) {
        if (['PAST', 'UNKNOWN'].includes(variables.eventPhase)) return 'songAdded';
        const rawHoursBeforeEvent = addition.hoursBeforeEvent, hoursBeforeEvent = rawHoursBeforeEvent == null || rawHoursBeforeEvent === '' ? null : Number(rawHoursBeforeEvent);
        if (hoursBeforeEvent != null && Number.isFinite(hoursBeforeEvent) && hoursBeforeEvent >= 0 && hoursBeforeEvent <= 24) return 'songAddedLastMinute';
        if (['TODAY', 'APPROACHING', 'PREPARATION'].includes(variables.eventPhase) && variables.hoursUntil != null && variables.hoursUntil >= 0) return 'songAddedFuture';
        return 'songAdded';
      }
      if (variables.pendingCount === 1) {
        const progressIsReliable = action.actionType === 'CONTINUE_PREPARATION' && variables.readyCount > 0 && variables.totalCount === variables.readyCount + 1 && variables.changedCount === 0;
        return progressIsReliable ? 'onePendingWithProgress' : 'onePending';
      }
      if (action.actionType === 'CONTINUE_PREPARATION' && variables.pendingCount === 2 && variables.readyCount != null && variables.totalCount === variables.readyCount + variables.pendingCount && variables.changedCount === 0) return 'twoPending';
      if (variables.eventPhase === 'TODAY' && variables.pendingCount != null) return 'today';
      if (variables.eventPhase === 'APPROACHING' && variables.hoursUntil != null && variables.hoursUntil >= 0 && variables.hoursUntil <= 24) return 'tomorrow';
      return variables.pendingCount == null ? 'withoutCount' : 'withCount';
    }
    return null;
  }
  function interpolate(template, variables) {
    return text(template).replace(/\{([A-Za-z0-9_]+)\}/g, (_, key) => text(variables[key]));
  }
  function resolve(action, context) {
    if (!action || action.actionType === 'NONE') return null;
    const meta = ACTION_META[action.actionType], variables = variablesFor(action, context && context.events);
    if (!meta) return null;
    const reliable = reliableKeyChange(action); if (reliable) Object.assign(variables, reliable);
    const family = familyFor(action, variables), variants = CATALOG[action.actionType] && CATALOG[action.actionType][family];
    if (!variants || !variants.length) return null;
    const seed = text(action.fingerprint) || [action.actionType, action.eventId, action.repertoireItemId, variables.pendingCount, variables.eventPhase].join(':');
    const index = hash(seed) % variants.length, variantId = `${action.actionType}.${family}.${index + 1}`, messageKey = `contextual.${action.actionType.toLowerCase()}.${family}`;
    return Object.freeze({
      messageKey, variantId, tone: 'roudy-contextual', variables: Object.freeze({ ...variables }),
      text: interpolate(variants[index], variables), kicker: meta.kicker, actionLabel: meta.actionLabel,
      usedLlm: false
    });
  }

  global.contextualCopy = Object.freeze({ CATALOG, resolve, hash });
  if (typeof module !== 'undefined' && module.exports) module.exports = global.contextualCopy;
})(typeof window !== 'undefined' ? window : globalThis);
