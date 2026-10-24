(function (global) {
  'use strict';

  function variant(value, intensity, structure) { return Object.freeze({ text: value, intensity, structure }); }
  const D = 'DISCRETO', F = 'DIVERTIDO', O = 'OUSADO';
  const CATALOG = Object.freeze({
    REVIEW_CHANGED_SONG: Object.freeze({
      generic: Object.freeze([
        variant('{songTitle} mudou depois da sua revisão. Confira a versão atual.', D, 'fato-acao'),
        variant('Mudança nos bastidores: {songTitle} recebeu um ajuste.', D, 'bastidores-fato')
      ]),
      keyChange: Object.freeze([
        variant('Atenção ao tom: {songTitle} mudou de {before} para {after}.', D, 'informacao-musical'),
        variant('{songTitle} agora está em {after}. Confira antes de tocar.', D, 'fato-acao')
      ])
    }),
    CHECK_EVENT_CHANGES: Object.freeze({
      key: Object.freeze([variant('Atenção ao tom: {changedSongTitle} agora está em {changeAfter}.', D, 'informacao-musical'), variant('Mudou o tom: {changedSongTitle} passou para {changeAfter}.', D, 'fato-acao')]),
      added: Object.freeze([variant('Plot twist: entrou música nova em {eventName}.', F, 'fato-comentario'), variant('Alerta de bastidores: {eventName} ganhou música nova.', F, 'bastidores-fato')]),
      removed: Object.freeze([variant('Uma música saiu do repertório de {eventName}.', D, 'fato-acao'), variant('O repertório de {eventName} ficou menor. Menos uma na lista.', F, 'fato-comentario')]),
      multiple: Object.freeze([variant('{eventName} recebeu {changeCountText}. Confira o que mudou.', D, 'fato-acao'), variant('O repertório não ficou parado: há {changeCountText} em {eventName}.', F, 'personificacao-fato')]),
      generic: Object.freeze([variant('Mudança nos bastidores: o repertório de {eventName} foi atualizado.', D, 'bastidores-fato'), variant('Alguém mexeu no repertório de {eventName}. Eu vi tudo.', F, 'fato-comentario')])
    }),
    START_PREPARATION: Object.freeze({
      songAdded: Object.freeze(['Música nova no repertório.']),
      songAddedFuture: Object.freeze(['Música nova no repertório. Respira. Ainda dá tempo.']),
      songAddedLastMinute: Object.freeze(['O repertório mudou. Sim, alguém adicionou música em cima da hora.']),
      withCount: Object.freeze([variant('{eventName} está chegando. Há {pendingCountText} sem confirmação de revisão.', D, 'fato-acao'), variant('O repertório de {eventName} está nos bastidores: {pendingCountSentence}.', F, 'bastidores-convite'), variant('Uma música de cada vez: há {pendingCountText} para revisar.', F, 'convite-progressivo')]),
      onePending: Object.freeze(['Tem uma música dando sopa por aqui.']),
      withoutCount: Object.freeze([variant('{eventName} está chegando. O repertório está disponível para revisão.', D, 'fato-acao'), variant('O calendário marcou {eventName}. Eu trouxe o repertório.', F, 'cumplicidade')]),
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
      withCount: Object.freeze([variant('{readyCountText} já confirmadas em {eventName}; há {pendingCountText} para revisar.', D, 'progresso-fato'), variant('O repertório andou. Agora restam {pendingCountText} em {eventName}.', F, 'progresso-comentario'), variant('Eu organizei a lista. Você já avançou e pode seguir por {pendingCountText}.', F, 'roadie-convite')]),
      onePending: Object.freeze(['Só falta uma música. Sempre tem uma.']),
      onePendingWithProgress: Object.freeze([
        'Só falta uma música. Sempre tem uma.',
        '{readyCountText} revisadas. Uma sobrevivente.'
      ]),
      twoPending: Object.freeze(['{readyCount} de {totalCount} músicas revisadas. As outras duas sabem quem são.']),
      withoutCount: Object.freeze([variant('Você já começou {eventName}. O repertório continua no mesmo lugar.', F, 'continuidade-neutra')]),
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
    }),
    CONTINUE_STUDY: Object.freeze({
      generic: Object.freeze([variant('{songTitle} perguntou por você.', F, 'personificacao'), variant('Eu guardei seu lugar em {songTitle}. De nada.', F, 'roadie-humor'), variant('Onde estávamos? Em {songTitle}.', F, 'pergunta-revelacao'), variant('Sua última música continua aqui: {songTitle}.', D, 'continuidade-neutra')])
    }),
    RECOGNIZE_PREPARATION: Object.freeze({
      complete: Object.freeze([variant('Repertório de {eventName} inteiro revisado. Temos um profissional aqui.', F, 'conquista-celebracao'), variant('Preparação confirmada em {eventName}. O palco que lute.', O, 'conquista-humor'), variant('Todas as músicas de {eventName} foram revisadas. Isso merece aplausos.', F, 'conquista-celebracao'), variant('Repertório em dia. Meu trabalho de roadie ficou mais fácil.', F, 'roadie-humor')])
    }),
    OPEN_UPCOMING_EVENT: Object.freeze({
      empty: Object.freeze([variant('{eventName} está chegando e ainda não tem repertório associado.', D, 'fato-acao'), variant('{eventName} já está no calendário e ainda não tem repertório. As músicas não chegaram aos bastidores.', F, 'bastidores-fato')]),
      todayUnknown: Object.freeze([variant('É hoje: {eventName}. Abra o repertório para a conferência do dia.', D, 'dia-evento-neutro'), variant('Hoje tem {eventName}. Eu trouxe o repertório; você traz a música.', F, 'cumplicidade')]),
      tomorrowReady: Object.freeze([variant('{eventName} é amanhã e o repertório está revisado.', F, 'fato-reconhecimento'), variant('Amanhã tem {eventName}. Preparação confirmada; agora é confiar no ensaio.', F, 'conquista-convite')]),
      tomorrowPending: Object.freeze([variant('{eventName} é amanhã. Há revisões pendentes no repertório.', D, 'fato-acao')]),
      tomorrowUnknown: Object.freeze([variant('{eventName} é amanhã. O status de preparação não foi confirmado.', D, 'fato-neutro'), variant('Amanhã tem {eventName}. O repertório está aqui para uma conferida, sem suposições.', F, 'cumplicidade')]),
      threeDaysReady: Object.freeze([variant('{eventName} chega em {daysUntil} dias, com o repertório revisado.', F, 'fato-reconhecimento')]),
      threeDaysPending: Object.freeze([variant('Faltam {daysUntil} dias para {eventName}. Há revisões pendentes.', D, 'fato-acao')]),
      threeDaysUnknown: Object.freeze([variant('Adivinha quem toca em {daysUntil} dias? Isso mesmo. Você.', F, 'pergunta-revelacao'), variant('{eventName} está a {daysUntil} dias. O calendário não mente.', F, 'fato-comentario')]),
      weekReady: Object.freeze([variant('{eventName} está no radar e o repertório já foi revisado.', F, 'fato-reconhecimento')]),
      weekPending: Object.freeze([variant('Uma semana para {eventName}. Há músicas aguardando revisão.', D, 'fato-acao'), variant('{eventName} vem aí. Uma música por vez mantém o improviso desesperado longe.', O, 'fato-humor')]),
      weekUnknown: Object.freeze([variant('{eventName} está no radar. O repertório pode ser aberto quando você quiser.', D, 'fato-neutro'), variant('O calendário está dizendo que temos música chegando: {eventName}.', F, 'fato-comentario')]),
      newEvent: Object.freeze([variant('{eventName} entrou na agenda. Os bastidores estão abertos.', F, 'bastidores-convite'), variant('Evento novo no radar: {eventName}.', D, 'fato-neutro')])
    })
  });

  const ACTION_META = Object.freeze({
    REVIEW_CHANGED_SONG: Object.freeze({ kicker: 'ALTERAÇÃO NO REPERTÓRIO', actionLabel: 'Revisar' }),
    CHECK_EVENT_CHANGES: Object.freeze({ kicker: 'MUDANÇAS NO EVENTO', actionLabel: 'Conferir alteração' }),
    START_PREPARATION: Object.freeze({ kicker: 'PRÓXIMO EVENTO', actionLabel: 'Começar' }),
    CONTINUE_PREPARATION: Object.freeze({ kicker: 'SUA PREPARAÇÃO', actionLabel: 'Continuar' }),
    ENTER_STAGE_MODE: Object.freeze({ kicker: 'EVENTO DE HOJE', actionLabel: 'Modo Palco' }),
    CONTINUE_STUDY: Object.freeze({ kicker: 'CONTINUE DE ONDE PAROU', actionLabel: 'Continuar estudando' }),
    RECOGNIZE_PREPARATION: Object.freeze({ kicker: 'PREPARAÇÃO EM DIA', actionLabel: 'Ver repertório' }),
    OPEN_UPCOMING_EVENT: Object.freeze({ kicker: 'PRÓXIMO EVENTO', actionLabel: 'Abrir evento' })
  });

  function text(value) { return String(value == null ? '' : value).trim(); }
  function safeScalar(value) { return ['string', 'number'].includes(typeof value) && text(value) ? text(value) : ''; }
  function hash(value) { let result = 2166136261; for (const char of text(value)) { result ^= char.charCodeAt(0); result = Math.imul(result, 16777619); } return result >>> 0; }
  function eventFor(action, events) { return (events || []).find(value => text(value && value.id) === text(action && action.eventId)); }
  function variablesFor(action, events) {
    const event = eventFor(action, events), latestChange = action && action.evidence && action.evidence.latestChange;
    const item = event && (event.repertoire || []).find(value => text(value && value.id) === text(action.repertoireItemId) || text(value && value.songId) === text(action && action.songId || latestChange && latestChange.songId));
    const pendingRaw = action && action.evidence && action.evidence.pendingCount, readyRaw = action && action.evidence && action.evidence.readyCount, totalRaw = action && action.evidence && action.evidence.totalCount, changedRaw = action && action.evidence && action.evidence.changedCount, hoursRaw = action && action.evidence && action.evidence.hoursUntil;
    const pendingCount = Number.isInteger(Number(pendingRaw)) && Number(pendingRaw) > 0 ? Number(pendingRaw) : null;
    const readyCount = Number.isInteger(Number(readyRaw)) && Number(readyRaw) >= 0 ? Number(readyRaw) : null;
    const totalCount = Number.isInteger(Number(totalRaw)) && Number(totalRaw) > 0 ? Number(totalRaw) : null;
    const changedCount = Number.isInteger(Number(changedRaw)) && Number(changedRaw) >= 0 ? Number(changedRaw) : null;
    const hoursUntil = Number.isFinite(Number(hoursRaw)) ? Number(hoursRaw) : null;
    return {
      eventName: text(event && event.title) || 'seu evento',
      songTitle: text(item && item.shared && item.shared.title) || 'A música',
      changedSongTitle: text(item && item.shared && item.shared.title) || 'Uma música',
      changeBefore: safeScalar(latestChange && latestChange.before),
      changeAfter: safeScalar(latestChange && latestChange.after) || 'um novo tom',
      pendingCount,
      readyCount,
      totalCount,
      changedCount,
      hoursUntil,
      pendingCountText: pendingCount == null ? '' : `${pendingCount} ${pendingCount === 1 ? 'música' : 'músicas'}`,
      pendingCountSentence: pendingCount == null ? '' : `${pendingCount === 1 ? 'Falta' : 'Faltam'} ${pendingCount} ${pendingCount === 1 ? 'música' : 'músicas'}`,
      readyCountText: readyCount == null ? '' : `${readyCount} ${readyCount === 1 ? 'música' : 'músicas'}`,
      eventPhase: text(action && action.evidence && action.evidence.eventPhase) || 'UNKNOWN',
      eventMoment: text(action && action.evidence && action.evidence.eventMoment) || 'UNKNOWN',
      preparationState: text(action && action.evidence && action.evidence.preparationState) || 'UNKNOWN',
      daysUntil: Number.isInteger(Number(action && action.evidence && action.evidence.daysUntil)) ? Number(action.evidence.daysUntil) : null,
      repertoireCount: Number.isInteger(Number(action && action.evidence && action.evidence.repertoireCount)) ? Number(action.evidence.repertoireCount) : null,
      changeCount: Number.isInteger(Number(action && action.evidence && action.evidence.changeCount)) ? Number(action.evidence.changeCount) : null,
      changeCountText: Number(action && action.evidence && action.evidence.changeCount) === 1 ? 'uma alteração' : `${Number(action && action.evidence && action.evidence.changeCount) || 0} alterações`
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
    if (action.actionType === 'CHECK_EVENT_CHANGES') {
      const types = Array.isArray(action.evidence && action.evidence.changeTypes) ? action.evidence.changeTypes : [];
      if (variables.changeCount > 1) return 'multiple';
      if (types.includes('KEY_CHANGED') || types.includes('CAPO_CHANGED')) return 'key';
      if (types.includes('SONG_ADDED')) return 'added';
      if (types.includes('SONG_REMOVED')) return 'removed';
      return 'generic';
    }
    if (action.actionType === 'CONTINUE_STUDY') return 'generic';
    if (action.actionType === 'RECOGNIZE_PREPARATION') return variables.readyCount != null && variables.totalCount === variables.readyCount ? 'complete' : null;
    if (action.actionType === 'OPEN_UPCOMING_EVENT') {
      if (variables.repertoireCount === 0) return 'empty';
      if (action.evidence && action.evidence.newlyCreated) return 'newEvent';
      const state = variables.preparationState === 'READY' ? 'Ready' : ['NOT_STARTED', 'IN_PROGRESS', 'NEEDS_REVIEW', 'CHANGED_AFTER_REVIEW'].includes(variables.preparationState) ? 'Pending' : 'Unknown';
      if (variables.eventMoment === 'TODAY') return 'todayUnknown';
      if (variables.eventMoment === 'TOMORROW') return `tomorrow${state}`;
      if (variables.eventMoment === 'THREE_DAYS') return `threeDays${state}`;
      return `week${state}`;
    }
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
  function normalizedVariant(value, family) {
    return typeof value === 'string' ? { text: value, intensity: F, structure: family } : value;
  }
  function recentEditorial(context) {
    return (context && Array.isArray(context.history) ? context.history : []).slice().sort((left, right) => String(right.presentedAt || '').localeCompare(String(left.presentedAt || ''))).slice(0, 4);
  }
  function resolve(action, context) {
    if (!action || action.actionType === 'NONE') return null;
    const meta = ACTION_META[action.actionType], variables = variablesFor(action, context && context.events);
    if (!meta) return null;
    const reliable = reliableKeyChange(action); if (reliable) Object.assign(variables, reliable);
    const family = familyFor(action, variables), variants = CATALOG[action.actionType] && CATALOG[action.actionType][family];
    if (!variants || !variants.length) return null;
    const seed = text(action.fingerprint) || [action.actionType, action.eventId, action.repertoireItemId, variables.pendingCount, variables.eventPhase].join(':');
    const recent = recentEditorial(context), usedVariants = new Set(recent.map(value => text(value.variantId))), usedStructures = new Set(recent.slice(0, 2).map(value => text(value.editorialStructure)));
    const normalized = variants.map(value => normalizedVariant(value, family));
    let eligible = normalized.map((value, index) => ({ value, index })).filter(entry => !usedVariants.has(`${action.actionType}.${family}.${entry.index + 1}`) && !usedStructures.has(text(entry.value.structure)));
    if (!eligible.length) eligible = normalized.map((value, index) => ({ value, index })).filter(entry => !usedVariants.has(`${action.actionType}.${family}.${entry.index + 1}`));
    if (!eligible.length) eligible = normalized.map((value, index) => ({ value, index }));
    const selected = eligible[hash(seed) % eligible.length], variantId = `${action.actionType}.${family}.${selected.index + 1}`, messageKey = `contextual.${action.actionType.toLowerCase()}.${family}`;
    return Object.freeze({
      messageKey, variantId, tone: 'roudy-contextual', variables: Object.freeze({ ...variables }),
      editorialFamily: family, intensity: selected.value.intensity, editorialStructure: selected.value.structure,
      text: interpolate(selected.value.text, variables), kicker: meta.kicker, actionLabel: meta.actionLabel,
      usedLlm: false
    });
  }

  global.contextualCopy = Object.freeze({ CATALOG, resolve, hash });
  if (typeof module !== 'undefined' && module.exports) module.exports = global.contextualCopy;
})(typeof window !== 'undefined' ? window : globalThis);
